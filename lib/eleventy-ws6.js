// WS6 images: filters and a build guard for the v3 media macros (_includes/v3/media.njk).
// Auto-registered by .eleventy.js (every lib/eleventy-*.js is loaded as a plugin).
//
//   picAlt(item, opts)      the alt text for one image, or a thrown build error naming the image
//                           when a non-decorative image has none, or the alt has an em dash, an
//                           en dash or an emoji (no client-readable text may carry those)
//   cdnSet(src, fmt, width) srcset for a CMS upload served by Netlify Image CDN, for example
//                           /.netlify/images?url=/images/uploads/a.jpg&w=640&fm=avif 640w, ...
//
// Guard: before every build, _data/images.json is checked: each rendition it names exists on
// disk, each entry has valid alt text, and no entry points at a do-not-use source.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CDN_WIDTHS = [480, 640, 960, 1280];

function badText(t) {
  if (new RegExp("["+String.fromCharCode(0x2013)+String.fromCharCode(0x2014)+"]").test(t)) return "an en or em dash";
  if (new RegExp("[" + String.fromCodePoint(0x1F000) + "-" + String.fromCodePoint(0x1FFFF) + String.fromCharCode(0x2600) + "-" + String.fromCharCode(0x27BF) + "]", "u").test(t)) return "an emoji";
  return "";
}

function label(item) {
  return (item && (item.fallback || item.src)) || "an image";
}

function picAlt(item, opts) {
  const o = opts || {};
  if (!item || typeof item !== "object") {
    throw new Error("v3/media.njk picture(): the image data is missing (got " + String(item) + "). Pass an entry of _data/images.json.");
  }
  if (o.decorative) return "";
  const alt = o.alt != null && String(o.alt).trim() !== "" ? o.alt : item.alt;
  if (alt == null || String(alt).trim() === "") {
    throw new Error("v3/media.njk picture(): alt text is required for " + label(item) + ". Pass { alt: \"...\" } or { decorative: true }.");
  }
  const bad = badText(String(alt));
  if (bad) throw new Error("v3/media.njk picture(): the alt text for " + label(item) + " contains " + bad + ".");
  return String(alt);
}

function cdnSet(src, fmt, width) {
  const w = Number(width) || CDN_WIDTHS[CDN_WIDTHS.length - 1];
  let list = CDN_WIDTHS.filter((x) => x <= w);
  if (!list.length) list = [w];
  return list.map((x) => "/.netlify/images?url=" + src + "&w=" + x + "&fm=" + fmt + " " + x + "w").join(", ");
}

function urlsOf(item) {
  const out = [];
  ["avif", "webp", "jpeg"].forEach((k) => {
    (item[k] || "").split(",").forEach((s) => {
      const u = s.trim().split(" ")[0];
      if (u) out.push(u);
    });
  });
  if (item.fallback) out.push(item.fallback);
  return out;
}

function checkImagesData() {
  const file = path.join(ROOT, "_data", "images.json");
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, "utf8").replace(new RegExp("^" + String.fromCharCode(0xFEFF)), ""));
  Object.keys(data).forEach((id) => {
    const it = data[id];
    if (id === "_logo") {
      [it.png, it.webp].forEach((u) => {
        if (u && !fs.existsSync(path.join(ROOT, u.replace(/^\//, "")))) throw new Error("images.json: logo file missing on disk: " + u);
      });
      return;
    }
    if (typeof it.alt !== "string" || it.alt.trim() === "") throw new Error("images.json: '" + id + "' has no alt text");
    const bad = badText(it.alt);
    if (bad) throw new Error("images.json: alt text of '" + id + "' contains " + bad);
    if (!it.width || !it.height) throw new Error("images.json: '" + id + "' has no width or height");
    urlsOf(it)
      .concat(it.phone ? urlsOf(it.phone) : [])
      .forEach((u) => {
        if (!fs.existsSync(path.join(ROOT, u.replace(/^\//, "")))) throw new Error("images.json: '" + id + "' names a missing file: " + u);
      });
  });
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addFilter("picAlt", picAlt);
  eleventyConfig.addFilter("cdnSet", cdnSet);
  eleventyConfig.on("eleventy.before", () => {
    checkImagesData();
  });
};
module.exports.picAlt = picAlt;
module.exports.cdnSet = cdnSet;
module.exports.checkImagesData = checkImagesData;
