
var linkArray = [];
var currentUrl = "#";
var timeId;
var currentTabId, // result of chrome.tabs.query of current active tab
    resultWindowId; // window id for putting resulting images
var currentIndex;


function downloadFile(filename)
{
    var a = document.getElementById("url");
    a.href = filename;
    a.click();
}

function getLinks(text)
{
    linkArray = text.split("\r\n");
    console.log(linkArray);
}


readLinkTextFile();

function beginScreenshot() {
    currentIndex = 0;
    openWebLinks(currentIndex);
}


function readLinkTextFile() {

    var url = chrome.runtime.getURL("file/LinkFile.txt");//if server is ready, delete this
    //  var url = "http://www.ruenav.com/";//if server is ready, uncomment this

    var xhrTimeout = 300000;

    var onResponseReceived = function () {
        this.onload = this.onerror = this.ontimeout = null;
        // xhr for local files gives status 0, but actually succeeds
        var status = this.status || 200;
        if (status < 200 || status >= 300) {
            return;
        }
        // consider an empty result to be an error
        if (this.response.byteLength == 0) {
            return;
        }
        getLinks(this.response);
        return;
    };

    var onErrorReceived = function () {
        this.onload = this.onerror = this.ontimeout = null;
//        onError.call(this);
        return;
    };

    var xhr = new XMLHttpRequest();
    try {
        xhr.open('get', url, true);
        xhr.timeout = xhrTimeout;
        xhr.onload = onResponseReceived;
        xhr.onerror = onErrorReceived;
        xhr.ontimeout = onErrorReceived;
        xhr.responseType = 'text';
        xhr.send();
    } catch (e) {
        onErrorReceived.call(xhr);
    }
}

function openWebLinks(index) {
    currentUrl = linkArray[index].trim();
    if (currentUrl != '')
    {
        chrome.tabs.create({
            url: currentUrl
        });

        timeId = window.setInterval(handleCurrentPage, 3000);
    }
}



function $(id) { return document.getElementById(id); }

function getFilename(contentURL) {
    var name = contentURL.split('?')[0].split('#')[0];
    if (name) {
        name = name
            .replace(/^https?:\/\//, '')
            .replace(/[^A-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^[_\-]+/, '')
            .replace(/[_\-]+$/, '');
        name = '-' + name;
    } else {
        name = '';
    }
    return 'screencapture' + name + '-' + Date.now() + '.png';
}


//
// Capture Handlers
//


function displayCaptures(filenames) {
    if (!filenames || !filenames.length) {
        console.log('uh-oh');
        return;
    }

    _displayCapture(filenames);
}


function _displayCapture(filenames) {

    for (var i = 0; i < filenames.length; i++)
    {
        filename = filenames[i];
        downloadFile(filename);
    }

    if (currentTabId != undefined)
    {
        try {
            chrome.tabs.remove(currentTabId, function () { })
        }
        catch (t)
        { console.log(t) }
    }
    if (currentIndex + 1 < linkArray.length)
    {
        currentIndex += 1;
        openWebLinks(currentIndex);
    }
}


function errorHandler(reason) {
    console.log("uh-oh");
}


function progress(complete) {
    if (complete === 0) {
        // Page capture has just been initiated.
        console.log('loading');
    }
}


function splitnotifier() {
    console.log('split-image');
}

function handleCurrentPage() {
    chrome.tabs.query({ active: true }, function (tabs) {
        var tab = tabs[0];
        if ((tab != undefined) && (tab.status == 'complete'))
        {
            currentTabId = tab.id; // used in later calls to get tab info

            var filename = getFilename(tab.url);

            var api = new CaptureAPI();
            api.captureToFiles(tab, filename, displayCaptures,
                                      errorHandler, progress, splitnotifier);

            window.clearInterval(timeId);
        }
    });
}
