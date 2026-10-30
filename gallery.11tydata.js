// Gallery hub and filter pages, overhaul v3 (WS5). One template, gallery.njk, paginated over
// gallery_views: the hub (/gallery) plus one crawlable page per service and per body type. The
// seven filter URLs that exist today ALWAYS build (blueprint 2: every existing URL keeps working),
// even when a filter holds a single photo.
//
// Rules this file enforces:
//   - Only items with checked === true, collection "job", no "excluded" reason, and a WS6 image in
//     _data/images.json appear anywhere (photos render through the picture() macro).
//   - Captions use vehicle, service, windows and the look in that photo only: never a shade
//     number (no job record holds one), never a city.
//   - Filters: service and vehicle are real links (static pages); windows and look filter in place
//     (assets/v3/js/gallery/50-gallery.js), offered only for values the records hold. No shade
//     filter until shades are recorded (blueprint 4.4; logged in WS5.md).
//   - "Build this look" links carry a WS4 build code (lib/buildcode.js) with the vehicle class and
//     the windows from the record; shade slots stay "xx" (not picked) because none is recorded.
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

const join = (list) => (list.length <= 1 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1]);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lower = (s) => String(s || "").toLowerCase();

function prep(it) {
  const svc = W.services[it.service] || { label: it.service };
  const set = new Set(it.panels || []);
  let panelWords = [];
  let windows = "";
  if (set.has("front-doors") && set.has("rear-doors")) { panelWords.push(W.panels_both); windows = "front-rear"; }
  else if (set.has("front-doors") && set.size === 1) { panelWords.push(W.panels["front-doors"]); windows = "front"; }
  else (it.panels || []).forEach((p) => { if (W.panels[p]) panelWords.push(W.panels[p]); });
  const v = it.vehicle || {};
  const body = v.body || "";
  const bodyDef = W.bodies[body] || null;
  const line2 = cap(svc.line_label + (panelWords.length ? ", " + join(panelWords) : ""));
  const lookLine = it.look && W.looks[it.look] ? W.looks[it.look] : "";
  const q = lower([v.make, v.model, body, bodyDef ? bodyDef.label : "", bodyDef ? (bodyDef.aliases || []).join(" ") : "",
    svc.label, svc.line_label, (svc.aliases || []).join(" "), panelWords.join(" "), it.title, it.look].filter(Boolean).join(" "));
  let build = "";
  if (it.service === "auto-tint" && body && B.CLASSES[body]) {
    const code = B.encode({ v: body, front: set.has("front-doors") ? "x" : 0, rear: set.has("rear-doors") ? "x" : 0, back: set.has("back-glass") ? "x" : 0, addons: [] });
    if (code) build = "/build-your-tint?b=" + encodeURIComponent(code);
  }
  return {
    id: it.id, service: it.service, body: body, make: v.make || "", title: it.title,
    line2: line2, look: it.look || "", lookLine: lookLine, windows: windows,
    alt: it.alt, image: IMAGES[it.id], q: q, build: build
  };
}

const ITEMS = (GALLERY.items || [])
  .filter((i) => i.checked === true && i.collection === "job" && !i.excluded && IMAGES[i.id])
  .map(prep);

function fillTokens(s, count, makes) {
  return String(s || "").replace(/\{count\}/g, String(count)).replace(/\{makes\}/g, makes);
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
    windows: W.windows_filter.filter((w) => items.some((i) => i.windows === w.id)),
    looks: W.look_filter.filter((l) => items.some((i) => i.look === l.id))
  };
}

function buildViews() {
  const views = [makeView(W.hub, "all", "all", "", "gallery", ITEMS)];
  FIXED_VIEWS.forEach((k) => {
    if (W.services[k]) views.push(makeView(W.services[k], "svc_" + k, "svc", k, "gallery/" + k, ITEMS.filter((i) => i.service === k)));
    else if (W.bodies[k]) views.push(makeView(W.bodies[k], "body_" + k, "body", k, "gallery/" + k, ITEMS.filter((i) => i.body === k)));
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
