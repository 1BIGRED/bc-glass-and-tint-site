// Structured data for hoa-window-film.html, built from _data/pages/hoa_window_film.json and
// site.json. Live node order: FAQPage, BreadcrumbList, Business, WebSite, WebPage. The FAQPage
// is generated from the SAME faq.items the page shows (lib/schema.js faqPlain), so the visible
// answers and the structured data cannot drift apart.
const S = require("./lib/schema");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.hoa_window_film;
      const sc = pg.schema;
      return S.graph([
        S.faqPageNode(pg.faq.items, { slug: data.slug }),
        S.breadcrumbNode({ slug: data.slug, name: S.plain(pg.hero.crumb) }),
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(pg.meta.title), dateModified: sc.date_modified })
      ]);
    }
  }
};
