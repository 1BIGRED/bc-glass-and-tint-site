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

// Split a gated display string ("From $350", "$80") into the parts the "From" card sets in
// different sizes (CREATIVE-DIRECTION.md 9.1). The words come from pricing.json via the gate;
// nothing is typed here. Anything that does not look like a plain dollar figure keeps its
// whole display string as `whole`.
function splitDisplay(display) {
  const m = /^(from\s+)?\$([\d,]+)(.*)$/i.exec(String(display || "").trim());
  if (!m) return { whole: String(display || "") };
  return { from: !!m[1], cur: "$", num: m[2], rest: (m[3] || "").trim() };
}

// "Kristie Bergman" -> "Kristie B." (doc 9.2: first name and initial); "John S." stays as is.
function shortName(name) {
  const p = String(name || "").trim().split(/\s+/);
  if (p.length < 2) return p[0] || "";
  const last = p[p.length - 1];
  return /^[A-Za-z]\.$/.test(last) ? p.join(" ") : p[0] + " " + last.charAt(0).toUpperCase() + ".";
}

module.exports = {
  eleventyComputed: {
    // v2 homepage: the Truck Wall strip shows the first N checked auto tint jobs from
    // _data/gallery.json (real BC job photos only). Empty list if the file is missing.
    // Image paths may carry a leading slash or not; both are normalized to one leading slash.
    v2_gallery: (data) => {
      const items = (data.gallery && data.gallery.items) || [];
      const n = (data.pages.home.v2 && data.pages.home.v2.gallery.count) || 8;
      const abs = (p) => "/" + String(p || "").replace(/^\/+/, "");
      return items
        .filter((it) => it.collection === "job" && it.service === "auto-tint" && it.checked === true)
        .slice(0, n)
        .map((it) => Object.assign({}, it, { src640: abs(it.img640), src1280: abs(it.img1280) }));
    },
    // Panel labels for the Truck Wall tags, read from pricing.json (auto_tint.panels[id].label),
    // so a tag never says more than the job record does.
    v2_panel_labels: (data) => {
      const out = {};
      const panels = (data.pricing && data.pricing.auto_tint && data.pricing.auto_tint.panels) || {};
      Object.keys(panels).forEach((k) => { if (panels[k] && panels[k].label) out[k] = panels[k].label; });
      return out;
    },
    // Light Meter teaser: the example shades from pricing.json (shades_installed once the owner
    // lists them), darkest first, each with the brief's gamma-aware overlay opacity
    // 1 - VLT^(1/2.2) (00-OVERHAUL-BRIEF 4.2, R5 5.2).
    v2_shades: (data) => {
      const pr = data.pricing || {};
      const owned = Array.isArray(pr.shades_installed) && pr.shades_installed.length ? pr.shades_installed : null;
      const vals = (owned || (pr.example_shades && pr.example_shades.values) || [])
        .map((v) => Number(typeof v === "object" && v ? v.vlt : v))
        .filter((v) => isFinite(v) && v > 0 && v < 100)
        .sort((a, b) => a - b);
      return {
        example: !owned,
        label: owned ? "" : (pr.example_shades && pr.example_shades.label) || "",
        items: vals.map((v) => ({ vlt: v, opacity: Math.round((1 - Math.pow(v / 100, 1 / 2.2)) * 1000) / 1000 }))
      };
    },
    // v2 service tiles that point at a gallery photo by id (gallery_id) get that item here.
    v2_gallery_by_id: (data) => {
      const out = {};
      ((data.gallery && data.gallery.items) || []).forEach((it) => {
        if (it.checked === true) out[it.id] = it;
      });
      return out;
    },
    // v2 prices, keyed by pricing.json path: { display, amount, draft, parts } when the gate
    // passes (resolvePrice above, unchanged), else absent. parts only re-cuts the gated display.
    v2_prices: (data) => {
      const v = data.pages.home.v2 || {};
      const paths = [v.hero && v.hero.price, v.build && v.build.estimate_price];
      ((v.prices && v.prices.cards) || []).forEach((c) => paths.push(c.price, c.note_price));
      const out = {};
      paths.filter(Boolean).forEach((p) => {
        const r = resolvePrice(data.pricing, p);
        if (r) out[p] = Object.assign({}, r, { parts: splitDisplay(r.display) });
      });
      return out;
    },
    // v2 review quotes: picked by name from the verbatim Google quotes in _data/pages/reviews.json,
    // never retyped, so the homepage cannot drift from the reviews page. short = "First L."
    v2_reviews: (data) => {
      const names = (data.pages.home.v2 && data.pages.home.v2.reviews.names) || [];
      const pool = (data.pages.reviews && data.pages.reviews.google_block && data.pages.reviews.google_block.items) || [];
      return names.map((nm) => pool.find((r) => r.name === nm)).filter(Boolean)
        .map((r) => Object.assign({}, r, { short: shortName(r.name) }));
    },
    // The single quote under the hero (doc 11.2), same verbatim pool.
    v2_quote1: (data) => {
      const q = data.pages.home.v2 && data.pages.home.v2.quote1;
      const pool = (data.pages.reviews && data.pages.reviews.google_block && data.pages.reviews.google_block.items) || [];
      const r = q && pool.find((x) => x.name === q.name);
      return r ? Object.assign({}, r, { short: shortName(r.name) }) : null;
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
