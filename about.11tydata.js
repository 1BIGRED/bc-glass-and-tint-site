// Structured data and Open Graph image for /about, "The shop" (v3, WS5): business, WebSite,
// WebPage. No rating or review count anywhere (C15, AP-28).
const W5 = require("./lib/eleventy-ws5").helpers;
module.exports = {
  eleventyComputed: {
    og_image: (data) => W5.ogImage(data).path,
    og_image_width: (data) => W5.ogImage(data).width,
    og_image_height: (data) => W5.ogImage(data).height,
    schema_ld: (data) => W5.simplePageGraph(data, data.pages.about)
  }
};