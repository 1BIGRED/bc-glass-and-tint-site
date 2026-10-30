// Structured data for /reviews (v3, WS5): business, WebSite, WebPage. No Review, no rating and no
// count markup, ever (AP-28; decisions-and-rules).
const W5 = require("./lib/eleventy-ws5").helpers;
module.exports = {
  eleventyComputed: {
    schema_ld: (data) => W5.simplePageGraph(data, data.pages.reviews)
  }
};
