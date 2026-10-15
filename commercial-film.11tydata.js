// Structured data for commercial-film.html, built from the page's wording file and site.json.
// Node order (Breadcrumb, Service, Business, WebSite, WebPage) comes from schema_order in the
// front matter of commercial-film.njk. See lib/schema.js servicePageGraph.
//
// Note for Chase: LIVE's WebPage name on this page ("...Boulder City & Henderson | BC Glass")
// differs from the title tag ("...Boulder City &amp; Las Vegas | BC Glass"). Kept as is for
// parity via pages.commercial_film.schema.webpage_name; not fixed here (main stays parity-only).
const S = require("./lib/schema");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => S.servicePageGraph(data.site, data.slug, data.pages[data.page_key], data.schema_order)
  }
};