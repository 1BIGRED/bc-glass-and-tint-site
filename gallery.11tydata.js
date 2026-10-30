// Gallery hub and filter pages, overhaul v3 (WS5), with the fitment-style search (2026-10-30, build
// log overhaul-v3/build-logs/GALLERY-SEARCH.md). One template, gallery.njk, paginated over
// gallery_views: the hub (/gallery) plus one crawlable page per service and per body type. The
// seven filter URLs that exist today ALWAYS build (blueprint 2: every existing URL keeps working),
// even when a filter holds a single photo. They are the pre-filtered entry points: each holds only
// its own photos, and the search panel filters inside them.
//
// Rules this file enforces:
//   - Only items with checked === true, collection "job", no "excluded" reason, and a WS6 image in
//     _data/images.json appear anywhere (photos render through the picture() macro).
//   - Every spec word comes from the item's own record: vehicle {type, make, model, year, trim},
//     service, windows {front_doors, rear_doors, back_glass, top_strip, sunroof} {done, shade},
//     film, look. A null prints nothing; a shade prints only when the record holds a number. Never
//     a city, never a customer's name or plate.
//   - Search facets (year, make, model, type, windows, look, front and rear shade) are built from
//     the values the records hold, so a control never offers a value with no photo behind it; a
//     facet with no values at all is not printed (no year select, no shade selects today).
//   - "Build this look" carries a WS4 build code (lib/buildcode.js): the vehicle class, every window
//     the record marks done, its shade when recorded, else "xx" (film, shade not picked).
//   - Structured data: one ImageGallery, one breadcrumb, the one business @id, from the same items.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const B = require("./lib/buildcode");
const GALLERY = require("./_data/gallery.json");
const W = require("./_data/pages/gallery.json");
const fs = require("fs");
const path = require("path");

const IMG_PATH = path.join(__dirname, "_data", "images.json");
const IMAGES = fs.existsSync(IMG_PATH) ? JSON.parse(fs.readFileSync(IMG_PATH, "utf8").replace(/^﻿/, "")) : {};
const FIXED_VIEWS = ["auto-tint", "home-film", "commercial-film", "chip-repair", "suv", "pickup", "car"];
const WIN_KEYS = ["front_doors", "rear_doors", "back_glass", "top_strip", "sunroof"];
// Legacy panels list (the current CMS form) -> the windows keys, used only when an item has no
// windows object yet (an item added through the old form).
const PANEL_TO_WIN = { "front-doors": "front_doors", "rear-doors": "rear_doors", "back-glass": "back_glass", "windshield-strip": "top_strip", sunroof: "sunroof" };

// Panel wording lives in _data/gallery.json search_ui. A CMS save of the gallery file that drops
// it must not break the build, so the same words stand behind it here and the build says so.
const UI_DEFAULT = {
  search_label: "Search make, model or words", search_placeholder: "Try F-150, Tesla or kitchen",
  year: "Year", make: "Make", model: "Model", any_year: "Any year", any_make: "Any make", any_model: "Any model",
  type: "Vehicle type", windows: "Windows done", look: "Look", shade_front: "Front shade", shade_rear: "Rear shade",
  any_shade: "Any shade", shade_value: "{n}%", more: "More filters", active: "Showing", remove: "Remove {label}",
  clear_all: "Clear all", nearest: "Closest match: show {n} without {filter}", see_all: "See every job",
  windows_opts: { front_doors: "Front doors", rear_doors: "Rear doors", back_glass: "Back glass", full: "Full sides and back", top_strip: "Windshield top strip", sunroof: "Sunroof" },
  spec: { vehicle: "Vehicle", type: "Type", service: "Service", windows: "Windows", shades: "Shades", film: "Film", look: "Look", front: "Front", rear: "Rear", back: "Back", strip: "Top strip", roof: "Sunroof" },
  spec_and: "and"
};
if (!GALLERY.search_ui) console.warn("[gallery] _data/gallery.json has no search_ui block; using the built-in panel wording.");
const UI = Object.assign({}, UI_DEFAULT, GALLERY.search_ui || {});
UI.windows_opts = Object.assign({}, UI_DEFAULT.windows_opts, (GALLERY.search_ui || {}).windows_opts || {});
UI.spec = Object.assign({}, UI_DEFAULT.spec, (GALLERY.search_ui || {}).spec || {});

const join = (list, and) => (list.length <= 1 ? list.join("") : list.slice(0, -1).join(", ") + " " + (and || "and") + " " + list[list.length - 1]);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lower = (s) => String(s || "").toLowerCase();
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const shadeOk = (v) => typeof v === "number" && isFinite(v) && v > 0 && v < 100;
// Search text: lower case, letters, digits and spaces only, so "F-150" and "f150" meet.
const norm = (s) => lower(s).replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();

function windowsOf(it) {
  const out = {};
  WIN_KEYS.forEach((k) => { out[k] = { done: null, shade: null }; });
  if (it.windows && typeof it.windows === "object") {
    WIN_KEYS.forEach((k) => {
      const w = it.windows[k] || {};
      let shade = shadeOk(w.shade) ? w.shade : null;
      // NRS 484D.440 (area-profile banned_claims LEGAL_RISK): the site never shows a front-door
      // shade darker than 35. A record that holds one is a typing slip or a job the site must not
      // advertise, so the number is dropped and the build says so.
      if (k === "front_doors" && shade !== null && shade < 35) {
        console.warn("[gallery] " + it.id + ": front_doors shade " + shade + " is darker than the Nevada front limit (35); not shown.");
        shade = null;
      }
      out[k] = { done: w.done === true ? true : w.done === false ? false : null, shade };
    });
  } else {
    (it.panels || []).forEach((p) => { if (PANEL_TO_WIN[p]) out[PANEL_TO_WIN[p]].done = true; });
  }
  return out;
}

// "Front and rear doors", "Full sides and back", "Front doors and windshield top strip".
function windowsText(win) {
  const d = (k) => win[k].done === true;
  const parts = [];
  if (d("front_doors") && d("rear_doors") && d("back_glass")) parts.push(UI.windows_opts.full);
  else {
    if (d("front_doors") && d("rear_doors")) parts.push(W.panels_both);
    else {
      if (d("front_doors")) parts.push(UI.windows_opts.front_doors);
      if (d("rear_doors")) parts.push(UI.windows_opts.rear_doors);
    }
    if (d("back_glass")) parts.push(UI.windows_opts.back_glass);
  }
  if (d("top_strip")) parts.push(UI.windows_opts.top_strip);
  if (d("sunroof")) parts.push(UI.windows_opts.sunroof);
  return cap(join(parts.map((p, i) => (i === 0 ? p : lower(p))), UI.spec_and));
}

function prep(it) {
  const svc = W.services[it.service] || { label: it.service, line_label: it.service };
  const v = it.vehicle || {};
  const type = str(v.type || v.body);
  const typeDef = W.bodies[type] || null;
  const make = str(v.make), model = str(v.model), trim = str(v.trim);
  const year = /^\d{4}$/.test(str(v.year)) ? str(v.year) : "";
  const vehName = [year, make, model, trim].filter(Boolean).join(" ");
  const isCar = it.service === "auto-tint";
  const win = windowsOf(it);
  const winDone = WIN_KEYS.filter((k) => win[k].done === true);
  if (win.front_doors.done && win.rear_doors.done && win.back_glass.done) winDone.push("full");
  const winText = isCar ? windowsText(win) : "";
  const film = str(it.film || it.film_line);
  const shadeFront = win.front_doors.done ? win.front_doors.shade : null;
  const shadeRear = win.rear_doors.done ? win.rear_doors.shade : null;
  const shadeBack = win.back_glass.done ? win.back_glass.shade : null;
  const sv = (n) => UI.shade_value.replace("{n}", String(n));
  const shadeParts = [];
  if (shadeFront !== null) shadeParts.push(UI.spec.front + " " + sv(shadeFront));
  if (shadeRear !== null) shadeParts.push(UI.spec.rear + " " + sv(shadeRear));
  if (shadeBack !== null && shadeBack !== shadeRear) shadeParts.push(UI.spec.back + " " + sv(shadeBack));
  if (win.top_strip.done && win.top_strip.shade !== null) shadeParts.push(UI.spec.strip + " " + sv(win.top_strip.shade));
  if (win.sunroof.done && win.sunroof.shade !== null) shadeParts.push(UI.spec.roof + " " + sv(win.sunroof.shade));
  const lookDef = isCar ? (W.look_filter || []).find((l) => l.id === it.look) : null;
  const lookTag = lookDef && W.look_tag ? W.look_tag.replace("{look}", lower(lookDef.label)) : "";

  // Tile spec line (one short line, every part from this record): type, windows, shades, look for
  // car tint; the service name otherwise.
  const tags = isCar
    ? [typeDef ? typeDef.label : "", winText].concat(shadeParts, [lookTag]).filter(Boolean)
    : [svc.line_label];
  // Viewer spec block: label and value pairs, known values only.
  const spec = [];
  // The viewer prints the title just above, so the vehicle row shows only when it adds something
  // (a trim, a year, or a title that names a detail rather than the vehicle).
  if (vehName && vehName !== str(it.title)) spec.push([UI.spec.vehicle, vehName]);
  if (typeDef) spec.push([UI.spec.type, typeDef.label]);
  spec.push([UI.spec.service, svc.line_label]);
  if (winText) spec.push([UI.spec.windows, winText]);
  if (shadeParts.length) spec.push([UI.spec.shades, shadeParts.join(", ")]);
  if (film) spec.push([UI.spec.film, film]);
  if (lookDef && W.looks[it.look]) spec.push([UI.spec.look, W.looks[it.look]]);

  const altPlain = String(it.alt || "").replace(/BC Glass (?:&amp;|&) Tint/g, " ");
  const q = norm([make, model, model.replace(/[\s-]+/g, ""), trim, year, type, typeDef ? typeDef.label : "", typeDef ? (typeDef.aliases || []).join(" ") : "",
    svc.label, svc.line_label, (svc.aliases || []).join(" "), winText, film, it.look, it.title, altPlain].filter(Boolean).join(" "));

  let build = "";
  if (isCar && type && B.CLASSES[type]) {
    const slot = (k) => (win[k].done ? (win[k].shade !== null ? win[k].shade : "x") : 0);
    const addons = [];
    if (win.top_strip.done) addons.push("top-strip");
    if (win.sunroof.done) addons.push("sunroof");
    let code = B.encode({ v: type, front: slot("front_doors"), rear: slot("rear_doors"), back: slot("back_glass"), addons });
    // A recorded shade the code cannot carry (for example a front shade darker than the law allows)
    // falls back to "shade not picked" for that window, never to a different number.
    if (!code) code = B.encode({ v: type, front: win.front_doors.done ? "x" : 0, rear: win.rear_doors.done ? "x" : 0, back: win.back_glass.done ? "x" : 0, addons });
    if (code) build = "/build-your-tint?b=" + encodeURIComponent(code);
  }
  return {
    id: it.id, service: it.service, body: type, type: type, make, model, year, trim, vehName,
    title: it.title, tags, spec, look: isCar ? str(it.look) : "", lookLine: lookDef ? W.looks[it.look] : "",
    win: winDone.join(" "), sf: shadeFront === null ? "" : String(shadeFront), sr: shadeRear === null ? "" : String(shadeRear),
    alt: it.alt, image: IMAGES[it.id], q, build
  };
}

const ITEMS = (GALLERY.items || [])
  .filter((i) => i.checked === true && i.collection === "job" && !i.excluded && IMAGES[i.id])
  .map(prep);

function fillTokens(s, count, makes) {
  return String(s || "").replace(/\{count\}/g, String(count)).replace(/\{makes\}/g, makes);
}

const countBy = (items, fn) => {
  const m = {};
  items.forEach((i) => { const k = fn(i); if (k) m[k] = (m[k] || 0) + 1; });
  return m;
};
const byName = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The search facets of one view: only values its own photos hold.
function facets(items) {
  const makes = countBy(items, (i) => i.make);
  const years = countBy(items, (i) => i.year);
  const models = [];
  const seen = {};
  items.forEach((i) => {
    if (!i.make || !i.model) return;
    const k = i.make + "|" + i.model;
    if (seen[k]) { seen[k].n++; return; }
    seen[k] = { id: i.model, make: i.make, n: 1 };
    models.push(seen[k]);
  });
  const winOpts = ["front_doors", "rear_doors", "back_glass", "full", "top_strip", "sunroof"]
    .map((k) => ({ id: k, label: UI.windows_opts[k], n: items.filter((i) => (" " + i.win + " ").indexOf(" " + k + " ") > -1).length }))
    // Offered only when it narrows the page (at least one photo, and not every photo on it).
    .filter((o) => o.n > 0 && o.n < items.length);
  const shadeList = (key) => Object.keys(countBy(items, (i) => i[key])).map(Number).sort((a, b) => b - a)
    .map((n) => ({ id: String(n), label: UI.shade_value.replace("{n}", String(n)) }));
  return {
    makes: Object.keys(makes).map((k) => ({ id: k, n: makes[k] })).sort(byName),
    models: models.sort((a, b) => (a.make + a.id < b.make + b.id ? -1 : 1)),
    years: Object.keys(years).map((k) => ({ id: k, n: years[k] })).sort((a, b) => (a.id < b.id ? 1 : -1)),
    windows: winOpts,
    shadesFront: shadeList("sf"),
    shadesRear: shadeList("sr")
  };
}

function makeView(def, key, kind, val, slug, items) {
  const makes = join(items.map((i) => i.make).filter((m, idx, a) => m && a.indexOf(m) === idx));
  const first = items[0] || null;
  const fb = first && first.image ? first.image.fallback : "";
  return {
    key, kind, val, slug, href: "/" + slug, permalink: slug + ".html",
    label: def.label, crumb: def.crumb || def.label, h1: def.h1,
    lead: fillTokens(def.lead, items.length, makes),
    schemaName: def.schema_name, metaTitle: def.meta_title,
    metaDescription: fillTokens(def.meta_description, items.length, makes),
    count: items.length, items,
    pageLink: def.page_link || "", pageHref: def.page_href || "",
    ogImage: fb ? fb.replace(/^\//, "") : "logo.png",
    imageAlt: first ? first.alt : "",
    facets: facets(items),
    // Vehicle type links show on the hub, car tint and vehicle pages (where car photos are).
    showTypes: items.some((i) => i.type),
    looks: W.look_filter.filter((l) => items.some((i) => i.look === l.id))
  };
}

function buildViews() {
  const views = [makeView(W.hub, "all", "all", "", "gallery", ITEMS)];
  FIXED_VIEWS.forEach((k) => {
    if (W.services[k]) views.push(makeView(W.services[k], "svc_" + k, "svc", k, "gallery/" + k, ITEMS.filter((i) => i.service === k)));
    else if (W.bodies[k]) views.push(makeView(W.bodies[k], "body_" + k, "body", k, "gallery/" + k, ITEMS.filter((i) => i.type === k)));
  });
  return views;
}

const VIEWS = buildViews();
const PAGE_META = {};
VIEWS.forEach((v) => {
  PAGE_META["gallery_" + v.key] = { meta: { title: v.metaTitle, description: v.metaDescription, image_alt: v.imageAlt } };
});

module.exports = {
  gallery_views: VIEWS,
  gallery_ui: UI,
  pages: PAGE_META,
  eleventyComputed: {
    slug: (data) => data.view.slug,
    page_key: (data) => "gallery_" + data.view.key,
    og_image: (data) => data.view.ogImage,
    gallery_filters: () => ({
      services: VIEWS.filter((v) => v.kind === "svc"),
      bodies: VIEWS.filter((v) => v.kind === "body")
    }),
    schema_ld: (data) => {
      const v = data.view;
      const url = S.pageUrl(v.slug);
      const crumbs = [
        { "@type": "ListItem", position: 1, name: W.crumb_home, item: S.ORIGIN + "/" },
        { "@type": "ListItem", position: 2, name: W.crumb_gallery, item: S.pageUrl("gallery") }
      ];
      if (v.key !== "all") crumbs.push({ "@type": "ListItem", position: 3, name: v.crumb, item: url });
      const imageGallery = {
        "@type": "ImageGallery",
        "@id": url + "#gallery",
        name: S.plain(v.schemaName),
        url: url,
        isPartOf: { "@id": S.WEBSITE_ID },
        about: { "@id": S.BUSINESS_ID },
        mainEntityOfPage: { "@id": url + "#webpage" },
        associatedMedia: v.items.map((i) => ({
          "@type": "ImageObject",
          contentUrl: S.ORIGIN + i.image.fallback,
          name: i.title,
          description: i.alt,
          width: i.image.width,
          height: i.image.height
        }))
      };
      return S.graph([
        { "@type": "BreadcrumbList", "@id": url + "#breadcrumb", itemListElement: crumbs },
        S.businessNode(data.site),
        imageGallery,
        S.websiteNode(data.site),
        S.webpageNode({ slug: v.slug, name: S.plain(fill(v.metaTitle)), dateModified: GALLERY.updated })
      ]);
    }
  }
};
