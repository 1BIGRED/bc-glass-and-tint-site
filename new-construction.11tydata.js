// Structured data for new-construction.html: three standalone JSON-LD blocks in LIVE.
// Block 0: @graph [Service (name-first order), Business, WebSite, WebPage].
// Block 1: standalone FAQPage, built from the SAME faq.items the page shows.
// Block 2: standalone BreadcrumbList (Home -> New Construction).
const S = require("./lib/schema");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.new_construction;
      const sc = pg.schema;
      const url = S.pageUrl(data.slug);
      const svc = S.serviceNode(
        {
          id: url + "#service",
          service_type: sc.service.service_type,
          name: sc.service.name,
          url: url,
          area_served: sc.service.area_served,
          description: S.plain(pg.meta.description)
        },
        "name-first"
      );
      const block0 = S.graph([
        svc,
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(pg.meta.title), dateModified: sc.date_modified })
      ]);
      const block1 = S.faqPageNode(pg.faq.items, { standalone: true });
      const block2 = S.breadcrumbNode({ slug: data.slug, name: sc.breadcrumb_name, standalone: true });
      return [block0, block1, block2];
    }
  }
};
