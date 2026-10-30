// Homepage data, overhaul v3 (WS5). Wording: _data/pages/home.json (v3) and pages/sections.json.
//   hero        the layout's hero slot object: mode "photo" (the parade frame, Chase 2026-10-29 10:03 PM),
//               "ramp" (the fallback when the image is missing) or "storefront" (Chase decides;
//               a data switch in home.json v3.hero.media_mode). Storefront needs WS6's crop
//               (ws5photos "storefront-hero", the customer's Bronco fully out of frame); without
//               it the slot stays the Light Ramp, so a missing photo never ships an empty box.
//   ws5_router  the three router tiles; the micro line shows a price only when the lib/pricing.js
//               gate lets one show in this build's mode (production: confirmed AND publish), else
//               the blueprint fallback words.
//   schema_ld   FAQPage from the SAME v3.faq.items the page prints, the one business node with the
//               offer catalog, WebSite, WebPage.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const { priceFor, priceMode } = require("./lib/pricing");
const W5 = require("./lib/eleventy-ws5").helpers;
const MODE = priceMode(process.env);

// Lowest price at a pricing path that passes the gate (a per-class map or a single entry).
function lowest(pricing, p) {
  const node = W5.at(pricing, p);
  if (!node) return null;
  const list = node.status ? [node] : Object.keys(node).map((k) => node[k]).filter((v) => v && typeof v === "object" && v.status);
  const ok = list.map((v) => ({ v, r: priceFor(v, MODE) })).filter((x) => x.r.show);
  if (!ok.length) return null;
  ok.sort((a, b) => a.v.amount - b.v.amount);
  return { amount: ok[0].v.amount, draft: ok.some((x) => x.r.draft) };
}

module.exports = {
  eleventyComputed: {
    hero: (data) => {
      const h = data.pages.home.v3.hero;
      const ph = data.ws5photos && data.ws5photos[h.storefront_photo];
      // Chase, 2026-10-29 10:03 PM: "Let's do the same picture as the current." media_mode "photo"
      // shows images[h.photo_image] (the parade frame, _data/images.json from scripts/images.js). It
      // reads images.json directly, not ws5photos, so the ws5photos do-not-use guard stays whole.
      const pimg = data.images && data.images[h.photo_image];
      if (h.media_mode === "photo" && pimg && pimg.fallback) {
        // caption: peak pass R1 (visual 2c), only what is in the frame (home.json v3.hero.photo_caption)
        return { mode: "photo", image: pimg, alt: pimg.alt, sizes: "(min-width: 1024px) min(52vw, 900px), calc(100vw - 40px)", note: "", caption: h.photo_caption || "" };
      }
      if (h.media_mode === "storefront" && ph) {
        return { mode: "storefront", image: ph.item, alt: ph.alt, sizes: "(min-width: 1024px) 50vw, 100vw", note: "" };
      }
      return { mode: "ramp", note: h.media_note };
    },
    ws5_router: (data) =>
      data.pages.home.v3.router.map((t) => {
        if (!t.price_ref) return Object.assign({}, t, { draft: false });
        const lo = lowest(data.pricing, t.price_ref);
        return Object.assign({}, t, {
          micro: lo ? t.price_tpl.replace("{amount}", String(lo.amount)) : t.fallback,
          draft: !!(lo && lo.draft)
        });
      }),
    schema_ld: (data) => {
      const pg = data.pages.home;
      const oc = pg.schema.offer_catalog;
      const items = oc.items.map((it) => ({ name: it.name, url: S.ORIGIN + it.path, id: S.ORIGIN + it.path + "#" + (it.id_suffix || "service") }));
      return S.graph([
        S.faqPageNode(pg.v3.faq.items, { slug: data.slug }),
        S.businessNode(data.site, { offerCatalog: S.offerCatalog({ name: oc.name, area_served: oc.area_served, items }) }),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: pg.schema.date_modified })
      ]);
    }
  }
};
