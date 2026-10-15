// Structured data for headlight-taillight.html, built from _data/pages/headlight_taillight.json
// and site.json. Live node order: BreadcrumbList, Business, WebSite, WebPage, Service
// ("id-first" key order, the same family as henderson/las-vegas city services).
const S = require("./lib/schema");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.headlight_taillight;
      const sc = pg.schema;
      const url = S.pageUrl(data.slug);
      return S.graph([
        S.breadcrumbNode({ slug: data.slug, name: S.plain(pg.hero.crumb) }),
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(pg.meta.title), dateModified: sc.date_modified }),
        S.serviceNode(
          {
            id: url + "#service",
            service_type: sc.service.service_type,
            name: sc.service.name,
            url: url,
            area_served: sc.service.area_served,
            description: S.plain(pg.meta.description)
          },
          "id-first"
        )
      ]);
    }
  }
};
