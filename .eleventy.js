const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { fill, jsonld, jsString, validAdsId, phoneCall, phoneDashed, phoneSchema, canonicalPath, sitemapEntries } = require("./lib/filters");
const platformLib = require("./lib/platform");
const validate = require("./lib/validate");

// Build context (WS1, 2026-10-29): one decision for robots, analytics, _headers, the claims guard
// and /v3-smoke/. See lib/platform.js.
const PLATFORM = platformLib.resolve(process.env);

// v3 asset bundles (overhaul v3, phase A foundation, 2026-10-29; engineering 3.1 "CSS and JS
// packaging"). Builders own separate source files; visitors get one hashed request per type.
//   core:   every *.css directly in assets/v3/css, concatenated in filename order, written to
//           /assets/h/core.<8 hex>.css; every *.js directly in assets/v3/js the same way to
//           /assets/h/core.<8 hex>.js. Keep numeric filename prefixes (00-tokens.css ...).
//   pages:  a subfolder assets/v3/css/<name>/ or assets/v3/js/<name>/ becomes its own bundle
//           /assets/h/<name>.<8 hex>.css or .js (for page-only code such as the builder), pulled
//           in by a page with front matter  bundles: ["<name>"].
// Templates read the hashed paths from global data assetsHash:
//   assetsHash.css.core, assetsHash.js.core, assetsHash.css.<name>, assetsHash.js.<name>
// The hash is the first 8 hex of the SHA-256 of the bundle's bytes, so the name changes only when
// the content does (immutable caching, engineering 3.10). Source files under assets/v3/css and
// assets/v3/js are not copied to the output; only the bundles are served.
const V3_SRC = path.join(__dirname, "assets", "v3");
const V3_TYPES = { css: "css", js: "js" };
const assetsHash = { css: {}, js: {} };
const bundleFiles = {}; // output path under the site root -> bundle text

function listBundleSources(dir, ext) {
  // { core: [files], <sub>: [files] } in filename order; missing folder = no bundles
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const top = entries.filter((e) => e.isFile() && e.name.endsWith("." + ext)).map((e) => path.join(dir, e.name));
  if (top.length) out.core = top;
  entries
    .filter((e) => e.isDirectory())
    .forEach((d) => {
      if (d.name === "core") throw new Error("assets/v3/" + ext + "/core/ is reserved: the core bundle is the top-level files");
      const files = fs
        .readdirSync(path.join(dir, d.name))
        .filter((f) => f.endsWith("." + ext))
        .sort()
        .map((f) => path.join(dir, d.name, f));
      if (files.length) out[d.name] = files;
    });
  return out;
}

function buildV3Bundles() {
  Object.keys(bundleFiles).forEach((k) => delete bundleFiles[k]);
  Object.keys(V3_TYPES).forEach((type) => {
    const map = assetsHash[type];
    Object.keys(map).forEach((k) => delete map[k]);
    const sources = listBundleSources(path.join(V3_SRC, type), V3_TYPES[type]);
    Object.keys(sources).forEach((name) => {
      const parts = sources[name].map((f) => {
        const rel = path.relative(V3_SRC, f).split(path.sep).join("/");
        let body = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
        // Peak pass R1 (technical 7, part A request 4): JS only, drop comments that START a line (block
        // comments that open a line, and // line comments), so the core bundle fits its 15 KB brotli
        // budget. Code and end-of-line comments are untouched. Every bundle is checked with node --check
        // after the build (see PEAK-R1-B.md). Never start a line inside a template string with /* or //.
        if (type === "js") body = body.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*\r?\n/gm, "").replace(/^[ \t]*\/\/[^\n]*\n/gm, "");
        return "/* " + rel + " */\n" + body.replace(/\s+$/, "") + "\n";
      });
      // JS parts are joined with a lone semicolon so one file can never run into the next.
      const text = parts.join(type === "js" ? ";\n" : "\n");
      const hash = crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
      const url = "/assets/h/" + name + "." + hash + "." + type;
      map[name] = url;
      bundleFiles[url.slice(1)] = text;
    });
  });
  return assetsHash;
}
buildV3Bundles();

module.exports = function (eleventyConfig) {
  // Auto-registered plugins (WS1, 2026-10-29). Every lib/eleventy-*.js file is loaded in filename
  // order and called as a plugin: module.exports = function (eleventyConfig) { ... }. Other
  // workstreams add filters, global data and events through their own lib/eleventy-<name>.js
  // without touching this file. A plugin that does not export a function stops the build.
  const libDir = path.join(__dirname, "lib");
  if (fs.existsSync(libDir)) {
    fs.readdirSync(libDir)
      .filter((f) => /^eleventy-.+\.js$/.test(f))
      .sort()
      .forEach((f) => {
        const plugin = require(path.join(libDir, f));
        if (typeof plugin !== "function") throw new Error("lib/" + f + " must export function(eleventyConfig){...}");
        eleventyConfig.addPlugin(plugin);
      });
  }

  // Static files: copied byte for byte, never processed.
  eleventyConfig.addPassthroughCopy("images");
  // assets/: everything is copied as before, EXCEPT the v3 CSS and JS sources, which reach the
  // site only as the hashed bundles above. Listed at startup, so a new folder in assets/ (or in
  // assets/v3/, such as fonts) is copied automatically.
  fs.readdirSync(path.join(__dirname, "assets")).forEach((name) => {
    if (name === "v3") {
      fs.readdirSync(V3_SRC).forEach((sub) => {
        if (sub === "css" || sub === "js") return;
        eleventyConfig.addPassthroughCopy("assets/v3/" + sub);
      });
      return;
    }
    eleventyConfig.addPassthroughCopy("assets/" + name);
  });
  eleventyConfig.addWatchTarget("./assets/v3/");
  eleventyConfig.addGlobalData("assetsHash", assetsHash);
  eleventyConfig.on("eleventy.before", () => {
    // Guard 1 (lib/validate.js): a bad value in _data/site.json stops the build in every context.
    validate.checkSiteData();
    // Guard 1b (lib/validate.js, peak pass R1): a bare numeric, boolean or null `name:` in
    // admin/config.yml stops the CMS from starting, so it stops the build too.
    validate.checkCmsConfig();
    buildV3Bundles();
  });
  eleventyConfig.on("eleventy.after", (args) => {
    const outDir = (args && args.directories && args.directories.output) || (args && args.dir && args.dir.output) || "_site";
    Object.keys(bundleFiles).forEach((rel) => {
      const dest = path.join(path.resolve(outDir), rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bundleFiles[rel], "utf8");
    });
    // A noindex build (staging, deploy preview, branch deploy) also marks every file, images and
    // the sitemap included, through a generated _headers file (engineering 3.6).
    const headersFile = path.join(path.resolve(outDir), "_headers");
    if (PLATFORM.noindex) {
      fs.writeFileSync(headersFile, "/*\n  X-Robots-Tag: noindex\n", "utf8");
    } else if (fs.existsSync(headersFile) && /X-Robots-Tag: noindex/.test(fs.readFileSync(headersFile, "utf8"))) {
      // An earlier noindex build left its file in this output folder; a production build must not ship it.
      fs.writeFileSync(headersFile, "# generated by .eleventy.js: no extra headers in a production build\n", "utf8");
    }
    // Guard 2 (lib/validate.js): banned claims and phone checks over every built page. Throws in a
    // production build, warns in any other.
    validate.scanOutput(outDir);
  });
  // requireValue: stops the build with a named message when a template is missing a value it
  // must have (used by the v3 media macro: an image without alt text never ships).
  eleventyConfig.addFilter("requireValue", (value, message) => {
    if (value == null || String(value).trim() === "") throw new Error(String(message || "requireValue: a required value is missing"));
    return value;
  });
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
    // sitemap.xml is generated by sitemap.njk (WS1); the old hand-written file is no longer copied.
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
  // Phone forms derived from phone.tel, the canonical public path, and the sitemap list.
  eleventyConfig.addFilter("phoneCall", phoneCall);
  eleventyConfig.addFilter("phoneDashed", phoneDashed);
  eleventyConfig.addFilter("phoneSchema", phoneSchema);
  eleventyConfig.addFilter("canonicalPath", canonicalPath);
  eleventyConfig.addFilter("sitemapEntries", sitemapEntries);

  // Prices (website overhaul 2026-10-29). price_mode is "preview" (drafts shown, tagged) when
  // BC_PRICE_MODE=preview or Netlify CONTEXT is deploy-preview/branch-deploy; else "production"
  // (only owner-confirmed, published prices). priceFor/quoteFor apply that one rule everywhere.
  const pricingLib = require("./lib/pricing");
  eleventyConfig.addGlobalData("price_mode", pricingLib.priceMode(process.env));
  // Context gating (WS1, engineering 3.5 and 3.6). `noindex` is true for BC_NOINDEX=1 (the staging
  // site) and for any Netlify CONTEXT that is set and is not "production" (deploy-preview,
  // branch-deploy, dev): such a build prints robots "noindex, nofollow", stubs GA4 and Clarity
  // and writes a _headers file with X-Robots-Tag. `analytics` is true only in a production build
  // (CONTEXT=production, no BC_NOINDEX); a local build with no CONTEXT sends no analytics.
  // Never set BC_NOINDEX on the live site. `buildEnv` is the whole answer, for templates.
  eleventyConfig.addGlobalData("noindex", PLATFORM.noindex);
  eleventyConfig.addGlobalData("analytics", PLATFORM.analytics);
  eleventyConfig.addGlobalData("buildEnv", PLATFORM);
  // The internal smoke page is never part of a production build.
  if (PLATFORM.production) eleventyConfig.ignores.add("v3-smoke.njk");
  eleventyConfig.ignores.add("_site-*/**");
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
