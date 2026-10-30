// Structured data and Open Graph image for /las-vegas (v3, WS5): Service nodes for the lanes shown,
// FAQPage from the SAME v3.faq.items the page prints, BreadcrumbList, the one business node,
// WebSite, WebPage. og_image: the storefront crop from WS6's images, else the logo.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const W5 = require("./lib/eleventy-ws5").helpers;

module.exports = {
  eleventyComputed: {
    og_image: (data) => W5.ogImage(data).path,
    og_image_width: (data) => W5.ogImage(data).width,
    og_image_height: (data) => W5.ogImage(data).height,
    schema_ld: (data) => {
      const pg = data.pages[data.page_key];
      const sc = pg.schema;
      const url = S.pageUrl(data.slug);
      const services = sc.services.map((s) =>
        S.serviceNode({ id: url + "#" + s.anchor, service_type: s.service_type, name: s.name, url: S.ORIGIN + s.path, area_served: s.area_served }, "id-first")
      );
      return S.graph(services.concat([
        S.faqPageNode(pg.v3.faq.items, { slug: data.slug }),
        S.breadcrumbNode({ slug: data.slug, name: S.plain(pg.v3.crumb) }),
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: sc.date_modified })
      ]));
    }
  }
};
