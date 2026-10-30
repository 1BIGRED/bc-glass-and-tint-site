// Nunjucks filters for the BC Glass & Tint site. Registered in .eleventy.js.
//
// Eleventy 3 runs Nunjucks with autoescape ON, so every value printed from data must end
// in `| safe` (wording is stored as exact HTML source, entities included). Filters here
// return plain strings; the template decides with `| safe`.

const fs = require("fs");
const path = require("path");

const SITE_JSON = path.join(__dirname, "..", "_data", "site.json");

// site.json is re-read when it changes on disk, so `npm run dev` picks up a new review
// count without a restart.
let siteCache = null;
let siteMtime = 0;
function readSite() {
  const m = fs.statSync(SITE_JSON).mtimeMs;
  if (!siteCache || m !== siteMtime) {
    siteCache = JSON.parse(fs.readFileSync(SITE_JSON, "utf8"));
    siteMtime = m;
  }
  return siteCache;
}

// Review counts and ratings are never typed into page wording. Pages write a token and
// this filter fills it from site.json "reviews".
const TOKENS = ["google_rating", "google_count", "yelp_rating", "yelp_count", "tintwiz_rating", "tintwiz_count"];
const TOKEN_RE = new RegExp("\\{(" + TOKENS.join("|") + ")\\}", "g");

function fill(value) {
  if (value == null) return "";
  const reviews = readSite().reviews || {};
  return String(value).replace(TOKEN_RE, (m, key) => (reviews[key] != null ? String(reviews[key]) : m));
}

// JSON-LD: plain JSON.stringify, which is exactly how the live blocks were written. v3: "<" is
// escaped so a typed "</script>" in editor text can never end the block it sits in.
function jsonld(obj) {
  const text = JSON.stringify(obj);
  return text === undefined ? "" : text.replace(/</g, "\\u003c");
}

// Editor-supplied text printed as a JavaScript string literal. "<" is escaped so a typed
// "</script>" cannot end the inline script it sits in.
function jsString(v) {
  return JSON.stringify(String(v == null ? "" : v)).replace(/</g, "\\u003c");
}

// validAdsId: a Google Ads conversion id must be "AW-" followed by digits. Anything else
// (empty, malformed, garbage) collapses to "", which the ga4 partial treats as "no tag".
const ADS_ID_PATTERN = /^AW-\d+$/;
function validAdsId(id) {
  return typeof id === "string" && ADS_ID_PATTERN.test(id) ? id : "";
}

// ---------------------------------------------------------------------------------------
// Phone forms (engineering 3.2.1). site.json types the number once, as phone.tel
// ("+17025508840"); these filters derive every printed form from it, so the forms cannot drift.
//   {{ site.phone.tel | phoneCall }}     (702) 550-8840
//   {{ site.phone.tel | phoneDashed }}   702-550-8840
//   {{ site.phone.tel | phoneSchema }}   +1-702-550-8840
// A malformed tel returns "" (lib/validate.js stops the build before this matters).
// ---------------------------------------------------------------------------------------
function phoneParts(tel) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(tel == null ? "" : tel));
  return m ? { a: m[1], b: m[2], c: m[3] } : null;
}
function phoneCall(tel) {
  const p = phoneParts(tel);
  return p ? "(" + p.a + ") " + p.b + "-" + p.c : "";
}
function phoneDashed(tel) {
  const p = phoneParts(tel);
  return p ? p.a + "-" + p.b + "-" + p.c : "";
}
function phoneSchema(tel) {
  const p = phoneParts(tel);
  return p ? "+1-" + p.a + "-" + p.b + "-" + p.c : "";
}

// ---------------------------------------------------------------------------------------
// Canonical path and sitemap entries (sitemap.njk, layouts/v3.njk).
// Netlify serves /auto-tint.html as /auto-tint and /book/index.html as /book/, so the public
// path drops ".html" and a trailing "index.html". The layout's canonical tag and the sitemap use
// this one function, so they can never disagree.
// ---------------------------------------------------------------------------------------
function canonicalPath(url) {
  let u = String(url == null ? "" : url);
  if (u === "/index.html" || u === "index.html") return "/";
  if (/\/index\.html$/.test(u)) u = u.slice(0, -"index.html".length);
  else if (/\.html$/.test(u)) u = u.slice(0, -".html".length);
  return u || "/";
}

function validDay(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z"));
}

// sitemapEntries(collectionItems, site, platform) -> [{ loc, lastmod }]
// A page is listed unless its URL is false, it is noindex (robots_noindex), it sets sitemap:
// false, or platform.json excludes its path. lastmod comes from page data only: front matter
// lastmod, else the page's wording file schema.date_modified, else gallery.json "updated" for the
// gallery pages. A page with none gets no lastmod rather than a made-up one. No priority and no
// changefreq (engineering 6, WS1 acceptance).
function sitemapEntries(items, site, platform) {
  const origin = (site && site.origin) || "https://bcglassandtint.com";
  const sm = (platform && platform.sitemap) || {};
  const excludePaths = (sm.exclude_paths || []).slice();
  const excludePrefixes = sm.exclude_prefixes || [];
  const out = [];
  (items || []).forEach((it) => {
    if (!it || !it.url || typeof it.url !== "string") return;
    const d = it.data || {};
    if (d.robots_noindex || d.sitemap === false) return;
    const p = canonicalPath(it.url);
    if (excludePaths.indexOf(p) > -1 || excludePaths.indexOf(it.url) > -1) return;
    if (excludePrefixes.some((x) => p.indexOf(x) === 0)) return;
    let lastmod = d.lastmod;
    if (!lastmod && d.pages && d.page_key && d.pages[d.page_key] && d.pages[d.page_key].schema) {
      lastmod = d.pages[d.page_key].schema.date_modified;
    }
    if (!lastmod && d.view && d.gallery && d.gallery.updated) lastmod = d.gallery.updated;
    if (lastmod instanceof Date) lastmod = lastmod.toISOString().slice(0, 10);
    out.push({ loc: origin + p, lastmod: validDay(lastmod) ? lastmod : "" });
  });
  const seen = {};
  const unique = out.filter((e) => (seen[e.loc] ? false : (seen[e.loc] = true)));
  unique.sort((a, b) => {
    if (a.loc === origin + "/") return -1;
    if (b.loc === origin + "/") return 1;
    return a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0;
  });
  return unique;
}

module.exports = {
  fill,
  jsonld,
  jsString,
  validAdsId,
  TOKENS,
  phoneCall,
  phoneDashed,
  phoneSchema,
  canonicalPath,
  sitemapEntries
};
