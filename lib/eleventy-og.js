// Global data og_share (peak pass R1, technical finding 10): the 1200 x 630 storefront link-preview
// image that layouts/v3.njk uses when a page has no photo of its own. Definition: lib/og-share.js.
// The file itself is rendered by scripts/images.js; if it is missing the layout keeps the page's own
// og_image, so a missing file never ships a broken preview.
"use strict";
const fs = require("fs");
const path = require("path");
const OG = require("./og-share");

module.exports = function (eleventyConfig) {
  eleventyConfig.addGlobalData("og_share", () => {
    const onDisk = fs.existsSync(path.join(__dirname, "..", OG.path.split("/").join(path.sep)));
    return onDisk ? { path: OG.path, width: OG.width, height: OG.height, alt: OG.alt } : null;
  });
};
