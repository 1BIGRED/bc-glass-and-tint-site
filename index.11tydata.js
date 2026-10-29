// Structured data for index.html (the homepage), built from _data/pages/home.json and site.json.
// Live node order: FAQPage, business (#business, with hasOfferCatalog right after sameAs),
// WebSite, WebPage. The FAQPage is generated from the SAME faq.items the page shows (lib/schema.js
// faqPlain), so the visible answers and the structured data cannot drift apart. hasOfferCatalog is
// built from pages.home.schema.offer_catalog via lib/schema.js offerCatalog().
// 2026-10-29: the homepage moved to layouts/v2.njk; the FAQ is still pg.faq.items, shown in full.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");

// v2 price gate (production rule from _data/pricing.json "gate"): a price shows ONLY when the
// entry's status is "confirmed" AND publish is true AND legal_hold is not true. Anything else,
// a missing file, a missing path, a draft or an unknown, resolves to null and the page prints
// the quiet "Call for a quote". A path that points at a per-vehicle-class map (car, suv, ...)
// shows the lowest class that passes the gate, as a "From" price.
// 2026-10-29 (CEO): the gate now goes through lib/pricing.js priceFor(), so preview builds
// (BC_PRICE_MODE=preview or a Netlify deploy-preview/branch-deploy) also show draft prices,
// flagged draft:true for the "Draft price" tag. Production is unchanged: confirmed + publish only.
const { priceFor, priceMode } = require("./lib/pricing");
const MODE = priceMode(process.env);
function resolvePrice(pricing, path) {
  if (!pricing || !path) return null;
  const node = String(path).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), pricing);
  if (!node || typeof node !== "object" || node.legal_hold === true) return null;
  if (node.status) {
    const r = priceFor(node, MODE);
    return r.show ? { display: r.display, amount: node.amount, draft: r.draft } : null;
  }
  const ok = Object.keys(node).map((k) => node[k]).filter((v) => v && typeof v === "object" && v.status)
    .map((v) => ({ v, r: priceFor(v, MODE) })).filter((x) => x.r.show);
  if (!ok.length) return null;
  ok.sort((a, b) => (a.v.amount || 0) - (b.v.amount || 0));
  const varies = ok.some((x) => x.v.amount !== ok[0].v.amount);
  const d = String(ok[0].r.display);
  return { display: varies && !/^from\b/i.test(d) ? "From " + d : d, amount: ok[0].v.amount, draft: ok.some((x) => x.r.draft) };
}

module.exports = {
  eleventyComputed: {
    // v2 homepage: the gallery strip shows the first N checked auto tint jobs from
    // _data/gallery.json (real BC job photos only). Empty list if the file is missing.
    v2_gallery: (data) => {
      const items = (data.gallery && data.gallery.items) || [];
      const n = (data.pages.home.v2 && data.pages.home.v2.gallery.count) || 4;
      return items.filter((it) => it.collection === "job" && it.service === "auto-tint" && it.checked === true).slice(0, n);
    },
    // v2 service tiles that point at a gallery photo by id (gallery_id) get that item here.
    v2_gallery_by_id: (data) => {
      const out = {};
      ((data.gallery && data.gallery.items) || []).forEach((it) => {
        if (it.checked === true) out[it.id] = it;
      });
      return out;
    },
    // v2 prices, keyed by pricing.json path: { display, amount } when the gate passes, else absent.
    v2_prices: (data) => {
      const v = data.pages.home.v2 || {};
      const paths = [v.hero && v.hero.price, v.build && v.build.estimate_price];
      ((v.prices && v.prices.cards) || []).forEach((c) => paths.push(c.price, c.note_price));
      const out = {};
      paths.filter(Boolean).forEach((p) => {
        const r = resolvePrice(data.pricing, p);
        if (r) out[p] = r;
      });
      return out;
    },
    // v2 review quotes: picked by name from the verbatim Google quotes in _data/pages/reviews.json,
    // never retyped, so the homepage cannot drift from the reviews page.
    v2_reviews: (data) => {
      const names = (data.pages.home.v2 && data.pages.home.v2.reviews.names) || [];
      const pool = (data.pages.reviews && data.pages.reviews.google_block && data.pages.reviews.google_block.items) || [];
      return names.map((nm) => pool.find((r) => r.name === nm)).filter(Boolean);
    },
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
