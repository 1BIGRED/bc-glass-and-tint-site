// WS5 (pages and templates) Eleventy plugin, overhaul v3, 2026-10-29.
// Auto-registered by .eleventy.js (every lib/eleventy-*.js). Owner: WS5. Adds only WS5 names
// (all prefixed ws5) so it can never shadow another stream's filter or global.
//
// What it provides
//   global ws5photos      photo key -> { item, alt, caption, source } for the v3 picture macro.
//                         Order per key: WS6's _data/images.json (the art-direction crops, when WS6
//                         lands them), then _data/v2images.json, then a checked BC job photo from
//                         _data/gallery.json. A key with none of these resolves to null and the
//                         template prints no image (type-only), never a stand-in. Files on the art
//                         direction 5.3 do-not-use list can never resolve (the build stops).
//   global ws5shades      the shade chips for the preview: owner's shades_installed, else the
//                         example shades, each with the Light Ramp alpha 1 - (VLT/100)^(1/2.2).
//   filter ws5featured    (reviews, service, n, skipIds) -> featurable Google reviews only.
//   filter ws5review      (reviews, id) -> one featurable Google review; throws otherwise.
//   filter ws5at          (pricing, "a.b.c", classId?) -> the pricing entry at that path.
//   filter ws5arith       (pricing, classId, mode) -> { front, rear, full } or null (blueprint 3.2:
//                         only when all three pass the gate AND front + rear === full; no "save").
//   filter ws5price       (entry, mode) -> lib/pricing.js priceFor result (read-only use).
//   filter ws5plain       HTML source -> plain text (schema, aria).
//   filter ws5fresh       (isoDate, days) -> true when the date is within `days` of the build.
//   filter ws5uniq        list of reviews -> without duplicates by id.
// Helpers for the page .11tydata.js files: require("./lib/eleventy-ws5").helpers
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUILD_DATE = new Date();

function readJson(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
}

// Art direction 5.3 "Do not use": no key may ever resolve to one of these sources.
const DO_NOT_USE = [
  /plaza-lot-through-glass/i,
  /shed-sinclair/i,
  /red-rolldoor/i,
  /(^|[\\/])lifestyle[\\/]/i,
  /AI-HIGGSFIELD|AI-RUNWAY/i,
  /AdobeStock/i,
  /stucco-arched-window-scaffold/i,
  /exterior-modern-two-story-scaffold/i,
  /white-ram-2500-truck/i,
  /bc-cover-shop-f150/i,
  /bullseye-chip-interior-wide/i,
  /bullseye-interior-wide/i,
  /images[\\/]hero\.(jpe?g|webp)$/i
];
function assertAllowed(src, key) {
  const s = String(src || "");
  DO_NOT_USE.forEach((re) => {
    if (re.test(s)) throw new Error("ws5photos: key '" + key + "' points at " + s + ", which is on the art direction 5.3 do-not-use list.");
  });
}

const abs = (p) => "/" + String(p || "").replace(/^\/+/, "");

// A gallery job record as a picture() item (same shape as _data/v2images.json entries).
function galleryItem(g) {
  return {
    width: g.w,
    height: g.h,
    fallback: abs(g.img1280),
    jpeg: abs(g.img640) + " " + (g.w640 || 640) + "w, " + abs(g.img1280) + " " + g.w + "w",
    alt: g.alt
  };
}

function resolvePhotos() {
  const sections = readJson("_data/pages/sections.json") || {};
  const map = sections.photos || {};
  const ws6 = readJson("_data/images.json") || {};
  const v2 = readJson("_data/v2images.json") || {};
  const gal = readJson("_data/gallery.json") || { items: [] };
  const byId = {};
  (gal.items || []).forEach((it) => { byId[it.id] = it; });
  const out = {};
  Object.keys(map).forEach((key) => {
    if (key.charAt(0) === "_") return;
    const def = map[key] || {};
    let hit = null;
    // WS6's _data/images.json only (the picture() macro's own shape: AVIF, WebP, JPEG). The
    // JPEG-only gallery fallback was retired once WS6 landed every crop (CEO relay, 2026-10-29).
    (def.ws6 || []).some((k) => {
      const it = ws6[k];
      if (it && it.fallback) {
        assertAllowed(it.source, key);
        assertAllowed(it.fallback, key);
        hit = { item: it, source: "ws6:" + k };
        return true;
      }
      return false;
    });
    if (hit) {
      // Alt and caption are written to the photo actually shown (decisions-and-rules: write the
      // copy to the photo you have), so each source type carries its own words.
      const kind = hit.source.split(":")[0];
      hit.alt = (def.alts && def.alts[kind]) || def.alt || hit.item.alt;
      hit.caption = (def.captions && def.captions[kind]) || def.caption || "";
      hit.ratio = def.ratio || "";
      out[key] = hit;
    } else {
      out[key] = null;
    }
  });
  return out;
}

function shadeChips() {
  const pr = readJson("_data/pricing.json") || {};
  const owned = Array.isArray(pr.shades_installed) && pr.shades_installed.length ? pr.shades_installed : null;
  const vals = (owned || (pr.example_shades && pr.example_shades.values) || [])
    .map((v) => Number(typeof v === "object" && v ? v.vlt : v))
    .filter((v) => isFinite(v) && v > 0 && v < 100)
    .sort((a, b) => b - a);
  return {
    example: !owned,
    label: owned ? "" : (pr.example_shades && pr.example_shades.label) || "",
    items: vals.map((v) => ({ vlt: v, alpha: Math.round((1 - Math.pow(v / 100, 1 / 2.2)) * 10000) / 10000, legal_front: v >= 35 }))
  };
}

// ---------- reviews ----------
function usable(r) {
  return r && r.platform === "google" && r.featurable === true && typeof r.text === "string" && r.text.trim() !== "";
}
function featured(reviews, service, n, skip) {
  const items = (reviews && reviews.items) || [];
  const skipIds = [].concat(skip || []);
  const out = items.filter((r) => usable(r) && skipIds.indexOf(r.id) < 0 && (!service || (r.services || []).indexOf(service) > -1));
  return out.slice(0, n || 1);
}
function review(reviews, id) {
  const items = (reviews && reviews.items) || [];
  const r = items.find((x) => x.id === id);
  if (!r) throw new Error("ws5review: no review with id '" + id + "' in _data/reviews.json");
  if (r.platform !== "google") throw new Error("ws5review: '" + id + "' is a " + r.platform + " review; only Google text may reach a page");
  if (r.featurable !== true) throw new Error("ws5review: '" + id + "' is featurable: false (" + (r.reason || "no reason given") + ")");
  return r;
}

// ---------- pricing (read-only use of lib/pricing.js) ----------
const pricingLib = require("./pricing");
function at(pricing, p, classId) {
  if (!pricing || !p) return null;
  let node = String(p).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), pricing);
  if (node && classId && node[classId] && typeof node[classId] === "object") node = node[classId];
  return node && typeof node === "object" ? node : null;
}
function arith(pricing, classId, mode) {
  const c = (pricing && pricing.auto_tint && pricing.auto_tint.coverage) || {};
  const f = c.two_front_doors && c.two_front_doors[classId];
  const r = c.rear_doors_and_back_glass && c.rear_doors_and_back_glass[classId];
  const u = c.full_vehicle && c.full_vehicle[classId];
  const pf = pricingLib.priceFor(f, mode);
  const pr = pricingLib.priceFor(r, mode);
  const pu = pricingLib.priceFor(u, mode);
  if (!pf.show || !pr.show || !pu.show) return null;
  if (f.amount + r.amount !== u.amount) return null;
  return { front: "$" + f.amount, rear: "$" + r.amount, full: "$" + u.amount, draft: pf.draft || pr.draft || pu.draft };
}

// ---------- text ----------
function plain(html) {
  const S = require("./schema");
  return S.faqPlain(html);
}
function fresh(iso, days) {
  if (!iso) return false;
  const d = new Date(String(iso) + (String(iso).length === 10 ? "T12:00:00Z" : ""));
  if (isNaN(d.getTime())) return false;
  return BUILD_DATE.getTime() - d.getTime() <= (days || 14) * 86400000 && d.getTime() <= BUILD_DATE.getTime() + 86400000;
}

// ---------- schema helpers for WS5 pages (built on lib/schema.js, WS1's) ----------
function faqNode(S, items, slug) {
  return items && items.length ? S.faqPageNode(items, { slug }) : null;
}
function servicePageGraph(data, pg) {
  const S = require("./schema");
  const { fill } = require("./filters");
  const txt = (h) => S.plain(fill(h));
  const sc = pg.schema || {};
  const sv = sc.service || null;
  const url = S.pageUrl(data.slug);
  const nodes = [S.breadcrumbNode({ slug: data.slug, name: sc.breadcrumb_name || txt(pg.v3.crumb || pg.v3.h1) })];
  nodes.push(S.businessNode(data.site));
  if (sv) {
    nodes.push(S.serviceNode({
      id: url + "#service",
      service_type: sv.service_type,
      name: sv.name,
      url: url,
      area_served: sv.area_served,
      description: sv.description || txt(pg.meta.description)
    }, "service-page"));
  }
  nodes.push(faqNode(S, pg.v3.faq && pg.v3.faq.items, data.slug));
  nodes.push(S.websiteNode(data.site));
  nodes.push(S.webpageNode({ slug: data.slug, name: txt(pg.meta.title), dateModified: sc.date_modified }));
  return S.graph(nodes);
}
function simplePageGraph(data, pg, extra) {
  const S = require("./schema");
  const { fill } = require("./filters");
  const sc = pg.schema || {};
  const nodes = [S.businessNode(data.site)];
  (extra || []).forEach((n) => nodes.push(n));
  nodes.push(S.websiteNode(data.site));
  nodes.push(S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: sc.date_modified }));
  return S.graph(nodes);
}

// Open Graph image for a v3 page: its hero photo from WS6's images (the largest JPEG in the
// item's srcset), else the logo. Returns { path (no leading slash), width, height }.
function ogImage(data) {
  const pg = (data.pages && data.pages[data.page_key]) || {};
  const key = pg.v3 && (pg.v3.hero_photo || pg.v3.og_photo);
  const ph = key && data.ws5photos ? data.ws5photos[key] : null;
  if (ph && ph.item && ph.item.jpeg) {
    const parts = String(ph.item.jpeg).split(",").map((s) => s.trim().split(/\s+/));
    const best = parts.reduce((a, b) => (parseInt(b[1], 10) > parseInt(a[1], 10) ? b : a));
    const w = parseInt(best[1], 10);
    return { path: best[0].replace(/^\/+/, ""), width: w, height: Math.round((w * ph.item.height) / ph.item.width) };
  }
  return { path: "logo.png", width: undefined, height: undefined };
}

function plugin(eleventyConfig) {
  eleventyConfig.addGlobalData("ws5photos", () => resolvePhotos());
  eleventyConfig.addGlobalData("ws5shades", () => shadeChips());
  eleventyConfig.addFilter("ws5featured", featured);
  eleventyConfig.addFilter("ws5review", review);
  eleventyConfig.addFilter("ws5at", at);
  eleventyConfig.addFilter("ws5arith", arith);
  eleventyConfig.addFilter("ws5price", (entry, mode) => pricingLib.priceFor(entry, mode));
  eleventyConfig.addFilter("ws5plain", plain);
  eleventyConfig.addFilter("ws5fresh", fresh);
  // ws5jobs(gallery, service, n): checked BC job photos for one service, in file order, that WS6
  // has a responsive image for (images[id]); never a do-not-use source, never an item marked
  // "excluded" (peak pass R2 part B request 3; gallery search pass 2026-10-30).
  eleventyConfig.addFilter("ws5jobs", (gallery, service, n) => {
    const ws6 = readJson("_data/images.json") || {};
    return ((gallery && gallery.items) || [])
      .filter((it) => it.checked === true && it.collection === "job" && !it.excluded && it.service === service && ws6[it.id])
      .filter((it) => !DO_NOT_USE.some((re) => re.test(String(it.source_master || "")) || re.test(String(it.img1280 || ""))))
      .slice(0, n || 4);
  });
  eleventyConfig.addFilter("ws5uniq", (list) => {
    const seen = {};
    return (list || []).filter((r) => (r && !seen[r.id] ? (seen[r.id] = true) : false));
  });
}

plugin.helpers = { ogImage, featured, review, at, arith, plain, fresh, servicePageGraph, simplePageGraph, resolvePhotos, shadeChips };
module.exports = plugin;
