// Structured data for reviews.html, built from _data/pages/reviews.json and site.json.
// Live node order: business, WebSite, WebPage. No breadcrumb, no FAQ, no aggregateRating.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.reviews;
      return S.graph([
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: pg.schema.date_modified })
      ]);
    }
  }
};
