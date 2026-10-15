// Structured data for about.html, built from _data/pages/about.json and site.json.
// Live node order: business, WebSite, WebPage. No breadcrumb and no FAQ on this page.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.about;
      return S.graph([
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: pg.schema.date_modified })
      ]);
    }
  }
};
