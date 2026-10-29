// Gallery hub and filter pages (website overhaul, 2026-10-29). One template, gallery.njk, is
// paginated over `gallery_views`: the hub (/gallery) plus one crawlable static page per service
// and per body type that has at least `min_items` photos. Everything is built from
// _data/gallery.json (read only) and the wording in _data/pages/gallery.json.
//
// Rules this file enforces:
//   - Only items with checked === true and collection "job" appear anywhere.
//   - Image paths are accepted with or without a leading slash and always printed with one.
//   - No shade page is generated: no item records a shade (shade is null on all of them), so
//     inventing /gallery/35-percent/ would be a page about nothing. Shade pages are a later job,
//     once the job records or the shade board photos carry a shade.
//   - Captions use vehicle, service and panels only: never a shade, never a city.
//   - Structured data (one ImageGallery, one breadcrumb, the one business @id) is generated from
//     the same items the page prints.
// Per-page title, description and image alt are merged into `pages` as gallery_<key> so the
// shared head (head/meta.njk reads pages[page_key].meta) prints unique tags for every page.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const GALLERY = require("./_data/gallery.json");
const W = require("./_data/pages/gallery.json");

const asPath = (p) => "/" + String(p || "").replace(/^\/+/, "");
const join = (list) => (list.length <= 1 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1]);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lower = (s) => String(s || "").toLowerCase();

function prep(it) {
  const svc = W.services[it.service] || { label: it.service };
  const svcLine = svc.line_label || svc.label;
  const set = new Set(it.panels || []);
  let panelWords = [];
  if (set.has("front-doors") && set.has("rear-doors")) panelWords.push(W.panels_both);
  else (it.panels || []).forEach((p) => { if (W.panels[p]) panelWords.push(W.panels[p]); });
  const line2 = svcLine + (panelWords.length ? ", " + join(panelWords) : "");
  const v = it.vehicle || {};
  const body = v.body || "";
  const bodyDef = W.bodies[body] || null;
  const q = lower([
    v.make, v.model, body, bodyDef ? bodyDef.label : "", bodyDef ? (bodyDef.aliases || []).join(" ") : "",
    it.service, svc.label, svcLine, (svc.aliases || []).join(" "), panelWords.join(" "), it.title
  ].filter(Boolean).join(" "));
  const action = svc.action_label
    ? { label: svc.action_label, href: svc.action_href }
    : { label: "", href: "" };
  return {
    id: it.id,
    service: it.service,
    body: body,
    make: v.make || "",
    title: it.title,
    line2: cap(line2),
    alt: it.alt,
    img640: asPath(it.img640),
    img1280: asPath(it.img1280),
    w: it.w, h: it.h, w640: it.w640, h640: it.h640,
    q: q,
    actionLabel: action.label,
    actionHref: action.href
  };
}

const ITEMS = (GALLERY.items || []).filter((i) => i.checked === true && i.collection === "job").map(prep);

function fillTokens(s, count, makes) {
  return String(s || "").replace(/\{count\}/g, String(count)).replace(/\{makes\}/g, makes);
}

function makeView(def, key, kind, val, slug, items) {
  const makes = join(items.map((i) => i.make).filter((m, idx, a) => m && a.indexOf(m) === idx));
  const count = items.length;
  const first = items[0] || null;
  return {
    key: key,
    kind: kind,
    val: val,
    slug: slug,
    href: "/" + slug,
    permalink: slug + ".html",
    label: def.label,
    crumb: def.crumb || def.label,
    h1: def.h1,
    lead: fillTokens(def.lead, count, makes),
    schemaName: def.schema_name,
    metaTitle: def.meta_title,
    metaDescription: fillTokens(def.meta_description, count, makes),
    count: count,
    items: items,
    ogImage: first ? first.img1280.replace(/^\//, "") : "images/hero.jpg",
    ogW: first ? first.w : undefined,
    ogH: first ? first.h : undefined,
    imageAlt: first ? first.alt : ""
  };
}

function buildViews() {
  const min = W.min_items || 2;
  const views = [makeView(W.hub, "all", "all", "", "gallery", ITEMS)];
  (W.service_order || []).forEach((k) => {
    const def = W.services[k];
    const list = ITEMS.filter((i) => i.service === k);
    if (def && list.length >= min) views.push(makeView(def, "svc_" + k, "svc", k, "gallery/" + k, list));
  });
  (W.body_order || []).forEach((k) => {
    const def = W.bodies[k];
    const list = ITEMS.filter((i) => i.body === k);
    if (def && list.length >= min) views.push(makeView(def, "body_" + k, "body", k, "gallery/" + k, list));
  });
  return views;
}

const VIEWS = buildViews();

// pages.gallery_<key>.meta, deep-merged into the global `pages` object (Eleventy's default data
// deep merge), so head/meta.njk finds unique tags per page without touching the shared head.
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
    og_image_width: (data) => data.view.ogW,
    og_image_height: (data) => data.view.ogH,
    // The shades on the Light Meter board (from pages.gallery.meter.shades), drawn at opacity = 1 - VLT^(1/2.2).
    shade_chips: (data) => data.pages.gallery.meter.shades.map((vlt) => ({
      vlt: vlt,
      opacity: Math.round((1 - Math.pow(vlt / 100, 1 / 2.2)) * 1000) / 1000
    })),
    // Filter links shown on every page: services first, then body types, each with its count.
    gallery_filters: (data) => ({
      services: VIEWS.filter((v) => v.kind === "svc"),
      bodies: VIEWS.filter((v) => v.kind === "body")
    }),
    // View list handed to gallery.js (plain text, no entities).
    views_json: (data) => VIEWS.map((v) => ({
      key: v.key, kind: v.kind, val: v.val, href: v.href,
      title: S.plain(fill(v.metaTitle)), h1: S.plain(v.h1), lead: S.plain(v.lead)
    })),
    schema_ld: (data) => {
      const v = data.view;
      const url = S.pageUrl(v.slug);
      const crumbs = [
        { "@type": "ListItem", position: 1, name: W.crumb_home, item: S.ORIGIN + "/" },
        { "@type": "ListItem", position: 2, name: W.crumb_gallery, item: S.pageUrl("gallery") }
      ];
      if (v.key !== "all") crumbs.push({ "@type": "ListItem", position: 3, name: v.crumb, item: url });
      const breadcrumb = { "@type": "BreadcrumbList", "@id": url + "#breadcrumb", itemListElement: crumbs };
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
          contentUrl: S.ORIGIN + i.img1280,
          thumbnailUrl: S.ORIGIN + i.img640,
          name: i.title,
          description: i.alt,
          width: i.w,
          height: i.h
        }))
      };
      return S.graph([
        breadcrumb,
        S.businessNode(data.site),
        imageGallery,
        S.websiteNode(data.site),
        S.webpageNode({ slug: v.slug, name: S.plain(fill(v.metaTitle)), dateModified: GALLERY.updated })
      ]);
    }
  }
};
