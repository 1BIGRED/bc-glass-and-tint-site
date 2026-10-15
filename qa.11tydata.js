// Structured data for qa.html: two standalone JSON-LD blocks in LIVE.
// Block 0: FAQPage, built from the SAME 39 questions the page shows (grouped the way the
// page groups them: faq_main's 5 categories, then faq_more's Headlights category).
// Block 1: standalone business graph (business, website, webpage). No breadcrumb, no service.
const S = require("./lib/schema");

module.exports = {
  eleventyComputed: {
    schema_ld: (data) => {
      const pg = data.pages.qa;
      // Built with plain indexed access (not .concat/.reduce/spread): those trigger
      // Symbol.isConcatSpreadable / Symbol.iterator lookups on Eleventy's computed-data
      // proxy during its dependency-detection pass, which crashes with "Cannot convert
      // a Symbol value to a string".
      const items = [];
      for (let i = 0; i < pg.faq_main.length; i++) {
        const g = pg.faq_main[i];
        for (let j = 0; j < g.items.length; j++) items.push(g.items[j]);
      }
      for (let j = 0; j < pg.faq_more.items.length; j++) items.push(pg.faq_more.items[j]);
      const block0 = S.faqPageNode(items, { standalone: true });
      const block1 = S.graph([
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(pg.meta.title), dateModified: pg.schema.date_modified })
      ]);
      return [block0, block1];
    }
  }
};
