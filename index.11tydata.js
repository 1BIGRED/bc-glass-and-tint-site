// Structured data for index.html (the homepage), built from _data/pages/home.json and site.json.
// Live node order: FAQPage, business (#business, with hasOfferCatalog right after sameAs),
// WebSite, WebPage. The FAQPage is generated from the SAME faq.items the page shows (lib/schema.js
// faqPlain), so the visible answers and the structured data cannot drift apart. hasOfferCatalog is
// built from pages.home.schema.offer_catalog via lib/schema.js offerCatalog().
const S = require("./lib/schema");
const { fill } = require("./lib/filters");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.home;
      const sc = pg.schema;
      const oc = sc.offer_catalog;
      const items = oc.items.map((it) => ({
        name: it.name,
        url: S.ORIGIN + it.path,
        id: S.ORIGIN + it.path + "#" + (it.id_suffix || "service")
      }));
      const offerCatalog = S.offerCatalog({ name: oc.name, area_served: oc.area_served, items });
      return S.graph([
        S.faqPageNode(pg.faq.items, { slug: data.slug }),
        S.businessNode(data.site, { offerCatalog }),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: sc.date_modified })
      ]);
    }
  }
};
