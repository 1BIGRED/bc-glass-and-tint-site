// Structured data for auto-tint.html, built from the page's wording file and site.json.
// Node order (Breadcrumb, Business, Service, WebSite, WebPage) comes from schema_order in the
// front matter of auto-tint.njk. See lib/schema.js servicePageGraph.
const S = require("./lib/schema");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => S.servicePageGraph(data.site, data.slug, data.pages[data.page_key], data.schema_order)
  }
};