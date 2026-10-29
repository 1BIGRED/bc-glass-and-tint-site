const fs = require("fs");
const path = require("path");
const { fill, jsonld, jsString, validAdsId } = require("./lib/filters");

module.exports = function (eleventyConfig) {
  // Static files: copied byte for byte, never processed.
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("assets");
  [
    "favicon.ico",
    "apple-touch-icon.png",
    "icon-16.png",
    "icon-32.png",
    "icon-48.png",
    "icon-192.png",
    "icon-512.png",
    "logo.png",
    "logo-hero.png",
    "logo.svg",
    "site.webmanifest",
    "robots.txt",
    "sitemap.xml",
    "_redirects",
    // Chase's local preview tool. Copied as is; _redirects keeps it off the live domain.
    "preview.html"
  ].forEach((f) => eleventyConfig.addPassthroughCopy(f));

  // Sveltia CMS (the office's content editor) lives at /admin/. Copy its two files
  // verbatim; the admin folder is ignored below so Eleventy never renders them as pages.
  eleventyConfig.addPassthroughCopy("admin/index.html");
  eleventyConfig.addPassthroughCopy("admin/config.yml");

  // fill: review tokens such as {google_count} -> the value in _data/site.json.
  eleventyConfig.addFilter("fill", fill);
  // jsonld: structured data objects (built in lib/schema.js) -> minified JSON.
  eleventyConfig.addFilter("jsonld", jsonld);
  // jsString: wording printed inside an inline script, as a safe JS string literal.
  eleventyConfig.addFilter("jsString", jsString);
  eleventyConfig.addFilter("validAdsId", validAdsId);

  // Prices (website overhaul 2026-10-29). price_mode is "preview" (drafts shown, tagged) when
  // BC_PRICE_MODE=preview or Netlify CONTEXT is deploy-preview/branch-deploy; else "production"
  // (only owner-confirmed, published prices). priceFor/quoteFor apply that one rule everywhere.
  const pricingLib = require("./lib/pricing");
  eleventyConfig.addGlobalData("price_mode", pricingLib.priceMode(process.env));
  // Staging (2026-10-29): BC_NOINDEX=1 on the staging Netlify site adds a robots noindex meta to
  // every page so the preview copy never competes with bcglassandtint.com in search. Never set it
  // on the live site.
  eleventyConfig.addGlobalData("noindex", String(process.env.BC_NOINDEX || "") === "1");
  eleventyConfig.addFilter("priceFor", (entry, mode) => pricingLib.priceFor(entry, mode));
  eleventyConfig.addFilter("quoteFor", (pricing, classId, panels, mode) => pricingLib.quoteFor(pricing, classId, panels, mode));
  eleventyConfig.addFilter("anyAutoPrice", (pricing, mode) => pricingLib.anyAutoPrice(pricing, mode));

  eleventyConfig.ignores.add("node_modules/**");
  eleventyConfig.ignores.add("_site/**");
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("admin/**");
  eleventyConfig.ignores.add("scripts/**");

  // Isolated builds for parallel work:
  //   BC_ONLY=chip-repair,henderson  builds only those root pages (every other root .njk
  //                                   page is ignored, so a half-finished page elsewhere
  //                                   cannot break this build).
  //   BC_OUT=<folder>                 writes the build there instead of _site.
  const only = (process.env.BC_ONLY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (only.length) {
    fs.readdirSync(__dirname)
      .filter((f) => f.endsWith(".njk"))
      .forEach((f) => {
        if (!only.includes(path.basename(f, ".njk"))) eleventyConfig.ignores.add(f);
      });
  }

  return {
    templateFormats: ["njk"],
    dir: {
      input: ".",
      output: process.env.BC_OUT ? process.env.BC_OUT : "_site",
      includes: "_includes",
      data: "_data"
    }
  };
};
