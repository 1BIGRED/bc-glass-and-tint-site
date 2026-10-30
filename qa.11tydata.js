// Structured data for /qa (v3, WS5): one FAQPage built from every visible item in pages.qa.v3.groups
// (the same list the page prints, through lib/schema.js faqPlain), plus business, WebSite, WebPage.
const S = require("./lib/schema");
const W5 = require("./lib/eleventy-ws5").helpers;
module.exports = {
  eleventyComputed: {
    qa_total: (data) => data.pages.qa.v3.groups.reduce((n, g) => n + g.items.length, 0),
    schema_ld: (data) => {
      const pg = data.pages.qa;
      const items = [];
      pg.v3.groups.forEach((g) => g.items.forEach((it) => items.push(it)));
      return W5.simplePageGraph(data, pg, [S.faqPageNode(items, { slug: data.slug })]);
    }
  }
};
