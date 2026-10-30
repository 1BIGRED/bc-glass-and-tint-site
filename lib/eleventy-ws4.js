// WS4 (pricing and the builder) Eleventy plugin, auto-registered by .eleventy.js (every
// lib/eleventy-*.js). The filters priceFor, quoteFor and anyAutoPrice stay in .eleventy.js; they and
// everything here call lib/pricing.js, so there is one gate.
//
// Filters for any template (WS5 homepage lanes, service pages, gallery):
//   entry | priceParts(mode)                 -> { show, draft, from, value, display }  (P-b: "From"
//                                               split off so the template sets it in t-label)
//   pricing | fullVsParts(classId, mode)     -> { front, rear, full, draft } or null (the arithmetic
//                                               line renders only when all three pass and sum)
//   pricing | presetsFor(mode)               -> gated presets
//   pricing | addonFor(addon, classId, mode) -> { state: priced | ask | hidden, display, ... }
//   build   | buildCode                      -> "BC-..." or "" (build object, see lib/buildcode.js)
//   code    | buildSummary(pricing)          -> plain one-line summary; shade numbers only when the
//                                               owner confirmed them (pricing.shades_installed)
//   code    | buildValid                     -> true or false
//   pricing | priceFallback(context)         -> blueprint 6.1 words: auto | home | crack | generic
const P = require("./pricing");
const B = require("./buildcode");

function priceParts(entry, mode) {
  const g = P.priceFor(entry, mode || "production");
  if (!g.show) return { show: false, draft: false, from: false, value: "", display: g.display };
  const m = /^from\s+(.*)$/i.exec(g.display);
  return { show: true, draft: g.draft, from: !!m, value: m ? m[1] : g.display, display: g.display };
}

function confirmedShades(pricing) {
  return P.shadesFor(pricing, "rear").filter((s) => s.confirmed).map((s) => s.vlt);
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addFilter("priceParts", priceParts);
  eleventyConfig.addFilter("fullVsParts", (pricing, classId, mode) => P.fullVsParts(pricing, classId, mode || "production"));
  eleventyConfig.addFilter("presetsFor", (pricing, mode) => P.presetFor(pricing, mode || "production"));
  eleventyConfig.addFilter("addonFor", (pricing, addon, classId, mode) => P.addonFor(pricing, addon, classId, mode || "production"));
  eleventyConfig.addFilter("buildCode", (build) => B.encode(build) || "");
  eleventyConfig.addFilter("buildSummary", (code, pricing) => B.summary(code, { confirmed: pricing ? confirmedShades(pricing) : [] }));
  eleventyConfig.addFilter("buildValid", (code) => B.isValid(code));
  eleventyConfig.addFilter("priceFallback", (pricing, context) => P.FALLBACKS[context] || P.FALLBACK);
};
module.exports.priceParts = priceParts;
module.exports.confirmedShades = confirmedShades;
