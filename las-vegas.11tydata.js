// Structured data for las-vegas.html, built from _data/pages/las_vegas.json and site.json.
// Live node order: six Service nodes, FAQPage, BreadcrumbList, business, WebSite, WebPage.
// The FAQPage is generated from the SAME faq.items the page shows (lib/schema.js faqPlain),
// so the visible answers and the structured data cannot drift apart.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.las_vegas;
      const sc = pg.schema;
      const url = S.pageUrl(data.slug);
      const services = sc.services.map((s) =>
        S.serviceNode(
          {
            id: url + "#" + s.anchor,
            service_type: s.service_type,
            name: s.name,
            url: S.ORIGIN + s.path,
            area_served: s.area_served
          },
          "id-first"
        )
      );
      return S.graph(
        services.concat([
          S.faqPageNode(pg.faq.items, { slug: data.slug }),
          S.breadcrumbNode({ slug: data.slug, name: S.plain(pg.hero.crumb) }),
          S.businessNode(data.site),
          S.websiteNode(data.site),
          S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: sc.date_modified })
        ])
      );
    }
  }
};
