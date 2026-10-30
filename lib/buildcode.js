// Build code (WS4, engineering 3.2.5). The one copy of the code lives in the browser bundle source
// so Node (the build, tests\buildcode.test.js, WS3's /book data) and the browser run the same file:
//   assets/v3/js/builder/10-buildcode.js   (UMD: module.exports in Node, window.BCBuild in a page)
// Format, law guard and API are documented at the top of that file.
module.exports = require("../assets/v3/js/builder/10-buildcode.js");
