// Structured data for /gift-cards (v3, WS5): business, WebSite, WebPage. No Offer or price markup
// (no amount is recorded).
const W5 = require("./lib/eleventy-ws5").helpers;
module.exports = {
  eleventyComputed: {
    schema_ld: (data) => W5.simplePageGraph(data, data.pages.gift_cards)
  }
};