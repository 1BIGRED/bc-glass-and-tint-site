// Structured data for privacy-policy.html: business, website, webpage only.
// No breadcrumb, no service node, on this page in LIVE.
const S = require("./lib/schema");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.privacy_policy;
      return S.graph([
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(pg.meta.title), dateModified: "2026-08-27" })
      ]);
    }
  }
};
