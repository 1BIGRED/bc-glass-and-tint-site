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

// JSON-LD: plain JSON.stringify, which is exactly how the live blocks were written.
function jsonld(obj) {
  return JSON.stringify(obj);
}

// Editor-supplied text printed as a JavaScript string literal. "<" is escaped so a typed
// "</script>" cannot end the inline script it sits in.
function jsString(v) {
  return JSON.stringify(String(v == null ? "" : v)).replace(/</g, "\\u003c");
}

module.exports = { fill, jsonld, jsString, TOKENS };
