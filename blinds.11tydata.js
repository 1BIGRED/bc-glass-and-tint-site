// Structured data and Open Graph image for /blinds (v3, WS5). Graph: Breadcrumb, business,
// Service (when the page names one), FAQPage built from the same v3.faq.items the page prints,
// WebSite, WebPage (lib/eleventy-ws5.js servicePageGraph). og_image: the page's hero photo from
// WS6's images, else the logo.
const W5 = require("./lib/eleventy-ws5").helpers;
module.exports = {
  eleventyComputed: {
    og_image: (data) => W5.ogImage(data).path,
    og_image_width: (data) => W5.ogImage(data).width,
    og_image_height: (data) => W5.ogImage(data).height,
    schema_ld: (data) => W5.servicePageGraph(data, data.pages[data.page_key])
  }
};
