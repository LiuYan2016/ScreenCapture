
var MAX_PRIMARY_DIMENSION = 15000 * 2,
    MAX_SECONDARY_DIMENSION = 4000 * 2,
    MAX_AREA = MAX_PRIMARY_DIMENSION * MAX_SECONDARY_DIMENSION;

var screenshots = [];
var loaded = false,
    timeout = 3000,
    timedOut = false;
var flag;
//
// URL Matching test - to verify we can talk to this URL
//

var matches = ['http://*/*', 'https://*/*', 'ftp://*/*', 'file://*/*'],
    noMatches = [/^https?:\/\/chrome.google.com\/.*$/];


function CaptureAPI(){

    this.captureToBlobs = function (tab, callback, errback, progress, splitnotifier) {
        noop = function () { };

        loaded = false,
        timeout = 3000,
        timedOut = false;
        screenshots = [],

        callback = callback || noop;
        errback = errback || noop;
        progress = progress || noop;

        function isValidUrl(url) {
            // couldn't find a better way to tell if executeScript
            // wouldn't work -- so just testing against known urls
            // for now...
            var r, i;
            for (i = noMatches.length - 1; i >= 0; i--) {
                if (noMatches[i].test(url)) {
                    return false;
                }
            }
            for (i = matches.length - 1; i >= 0; i--) {
                r = new RegExp('^' + matches[i].replace(/\*/g, '.*') + '$');
                if (r.test(url)) {
                    return true;
                }
            }
            return false;
        }

        if (!isValidUrl(tab.url)) {
            errback('invalid url'); // TODO errors
        }

        function capture(data, screenshots_in, sendResponse, splitnotifier) {
            console.log("pos1: " + screenshots_in.length);
            flag = 1;
            chrome.tabs.captureVisibleTab(
                null, { format: 'png', quality: 100 }, function (dataURI) {
                    console.log("pos-1.5: " + screenshots_in.length); flag = 0;
                    if (dataURI) {
                        var image_t = new Image();
                        image_t.onload = function () {
                            console.log("pos2: " + screenshots_in.length);

                            data.image_t = { width: image_t.width, height: image_t.height };

                            // given device mode emulation or zooming, we may end up with
                            // a different sized image than expected, so let's adjust to
                            // match it!
                            if (data.windowWidth !== image_t.width) {
                                var scale = image_t.width / data.windowWidth;
                                data.x *= scale;
                                data.y *= scale;
                                data.totalWidth *= scale;
                                data.totalHeight *= scale;
                            }

                            function _initScreenshots(totalWidth, totalHeight) {
                                // Create and return an array of screenshot objects based
                                // on the `totalWidth` and `totalHeight` of the final image.
                                // We have to account for multiple canvases if too large,
                                // because Chrome won't generate an image otherwise.
                                //
                                var badSize = (totalHeight > MAX_PRIMARY_DIMENSION ||
                                               totalWidth > MAX_PRIMARY_DIMENSION ||
                                               totalHeight * totalWidth > MAX_AREA),
                                    biggerWidth = totalWidth > totalHeight,
                                    maxWidth = (!badSize ? totalWidth :
                                                (biggerWidth ? MAX_PRIMARY_DIMENSION : MAX_SECONDARY_DIMENSION)),
                                    maxHeight = (!badSize ? totalHeight :
                                                 (biggerWidth ? MAX_SECONDARY_DIMENSION : MAX_PRIMARY_DIMENSION)),
                                    numCols = Math.ceil(totalWidth / maxWidth),
                                    numRows = Math.ceil(totalHeight / maxHeight),
                                    row, col, canvas, left, top;

                                var canvasIndex = 0;
                                var result = [];
                                left = 0;
                                top = 0;

                                for (row = 0; row < numRows; row++) {
                                    for (col = 0; col < numCols; col++) {
                                        canvas = document.createElement('canvas');
                                        canvas.width = (col == numCols - 1 ? totalWidth % maxWidth || maxWidth :
                                                        maxWidth);
                                        canvas.height = (row == numRows - 1 ? totalHeight % maxHeight || maxHeight :
                                                         maxHeight);

                                        left = col * maxWidth;
                                        top = row * maxHeight;

                                        result.push({
                                            canvas: canvas,
                                            ctx: canvas.getContext('2d'),
                                            index: canvasIndex,
                                            left: left,
                                            right: left + canvas.width,
                                            top: top,
                                            bottom: top + canvas.height
                                        });

                                        canvasIndex++;
                                    }
                                }

                                return result;
                            }

                            // lazy initialization of screenshot canvases (since we need to wait
                            // for actual image size)
                            if (!screenshots_in.length) {
                                console.log("pos-x: " + screenshots_in.length);
                                Array.prototype.push.apply(
                                    screenshots_in,
                                    _initScreenshots(data.totalWidth, data.totalHeight)
                                );
                                if (screenshots_in.length > 1) {
                                    if (splitnotifier) {
                                        splitnotifier();
                                    }
                                    $('screenshot-count').innerText = screenshots_in.length;
                                }
                            }

                            function _filterScreenshots(imgLeft, imgTop, imgWidth, imgHeight, screenshots) {
                                // Filter down the screenshots to ones that match the location
                                // of the given image.
                                //
                                var imgRight = imgLeft + imgWidth,
                                    imgBottom = imgTop + imgHeight;
                                return screenshots.filter(function (screenshot) {
                                    return (imgLeft < screenshot.right &&
                                            imgRight > screenshot.left &&
                                            imgTop < screenshot.bottom &&
                                            imgBottom > screenshot.top);
                                });
                            }
                            // draw it on matching screenshot canvases
                            _filterScreenshots(
                                data.x, data.y, image_t.width, image_t.height, screenshots_in
                            ).forEach(function (screenshot) {
                                screenshot.ctx.drawImage(
                                    image_t,
                                    data.x - screenshot.left,
                                    data.y - screenshot.top
                                );
                            });

                            // send back log data for debugging (but keep it truthy to
                            // indicate success)
                            sendResponse(JSON.stringify(data, null, 4) || true);
                        };
                        image_t.src = dataURI;
                        delete image_t;
                    }
                });
        }

        console.log("pos-1: " + screenshots.length); flag = 0;
        // TODO will this stack up if run multiple times? (I think it will get cleared?)
        chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
            if (request.msg === 'capture') {
                if (flag == 0)
                {
                    console.log("pos0: " + screenshots.length);
                    progress(request.complete);
                    capture(request, screenshots, sendResponse, splitnotifier);
                }
                return true;

            } else {
                console.error('Unknown message received from content script: ' + request.msg);
                errback('internal error');
                return false;
            }
        });

        chrome.tabs.executeScript(tab.id, { file: 'page.js' }, function () {
            if (timedOut) {
                console.error('Timed out too early while waiting for ' +
                              'chrome.tabs.executeScript. Try increasing the timeout.');
            } else {
                loaded = true;
                progress(0);

                function getBlobs(screenshots) {
                    return screenshots.map(function (screenshot) {
                        var dataURI = screenshot.canvas.toDataURL();

                        // convert base64 to raw binary data held in a string
                        // doesn't handle URLEncoded DataURIs
                        var byteString = atob(dataURI.split(',')[1]);

                        // separate out the mime component
                        var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

                        // write the bytes of the string to an ArrayBuffer
                        var ab = new ArrayBuffer(byteString.length);
                        var ia = new Uint8Array(ab);
                        for (var i = 0; i < byteString.length; i++) {
                            ia[i] = byteString.charCodeAt(i);
                        }

                        // create a blob for writing to a file
                        var blob = new Blob([ab], { type: mimeString });
                        return blob;
                    });
                }
                chrome.tabs.sendMessage(tab.id, { msg: 'scrollPage' }, function () {
                    // We're done taking snapshots of all parts of the window. Display
                    // the resulting full screenshot images in a new browser tab.
                    callback(getBlobs(screenshots));
                });
            }
        });

        window.setTimeout(function () {
            if (!loaded) {
                timedOut = true;
                errback('execute timeout');
            }
        }, timeout);
    };

    this.captureToFiles = function (tab, filename, callback, errback, progress, splitnotifier) {

        function saveBlob(blob, filename, index, callback, errback) {

            function _addFilenameSuffix(filename, index) {
                if (!index) {
                    return filename;
                }
                var sp = filename.split('.');
                var ext = sp.pop();
                return sp.join('.') + '-' + (index + 1) + '.' + ext;
            }

            filename = _addFilenameSuffix(filename, index);

            function onwriteend() {
                // open the file that now contains the blob - calling
                // `openPage` again if we had to split up the image
                var urlName = ('filesystem:chrome-extension://' +
                               chrome.i18n.getMessage('@@extension_id') +
                               '/temporary/' + filename);

                callback(urlName);
            }

            // come up with file-system size with a little buffer
            var size = blob.size + (1024 / 2);

            // create a blob for writing to a file
            var reqFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
            reqFileSystem(window.TEMPORARY, size, function (fs) {
                fs.root.getFile(filename, { create: true }, function (fileEntry) {
                    fileEntry.createWriter(function (fileWriter) {
                        fileWriter.onwriteend = onwriteend;
                        fileWriter.write(blob);
                    }, errback); // TODO - standardize error callbacks?
                }, errback);
            }, errback);
        }


        this.captureToBlobs(tab, function (blobs) {
            var i = 0,
                len = blobs.length,
                filenames = [];

            (function doNext() {
                saveBlob(blobs[i], filename, i, function (filename) {
                    i++;
                    filenames.push(filename);
                    i >= len ? callback(filenames) : doNext();
                }, errback);
            })();
        }, errback, progress, splitnotifier);
    }
}

