// v2 responsive images. Run once after adding or replacing a photo in images-src/v2/:
//   node scripts/v2-images.js
// Writes AVIF, WebP and JPEG at 640, 1280 and 1800 px wide (never upscaled) into images/v2/,
// and a size table into _data/v2images.json that the v2 templates read for srcset, width and
// height. Source photos are real BC job photos only. This folder is ignored by Eleventy.
const path = require("path");
const fs = require("fs");
const imgMod = require("@11ty/eleventy-img");
const Image = typeof imgMod === "function" ? imgMod : imgMod.default || imgMod.Image;

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "images-src", "v2");
const OUT = path.join(ROOT, "images", "v2");
const DATA = path.join(ROOT, "_data", "v2images.json");
const WIDTHS = [640, 960, 1280, 1800];

(async () => {
  const files = fs.readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort();
  const table = {};
  for (const f of files) {
    const name = path.basename(f, path.extname(f));
    const meta = await Image(path.join(SRC, f), {
      widths: WIDTHS,
      formats: ["avif", "webp", "jpeg"],
      outputDir: OUT,
      urlPath: "/images/v2/",
      filenameFormat: (id, src, width, format) => `${name}-${width}.${format}`,
      sharpJpegOptions: { quality: 78, mozjpeg: true, progressive: true },
      sharpWebpOptions: { quality: 74 },
      sharpAvifOptions: { quality: 45 }
    });
    const pick = (fmt) => meta[fmt].map((m) => ({ url: m.url, width: m.width, height: m.height }));
    const jpeg = pick("jpeg");
    const largest = jpeg[jpeg.length - 1];
    table[name] = {
      width: largest.width,
      height: largest.height,
      fallback: jpeg[Math.min(1, jpeg.length - 1)].url,
      avif: pick("avif").map((m) => `${m.url} ${m.width}w`).join(", "),
      webp: pick("webp").map((m) => `${m.url} ${m.width}w`).join(", "),
      jpeg: jpeg.map((m) => `${m.url} ${m.width}w`).join(", "),
      first_avif: meta.avif[0].url
    };
    console.log(name, jpeg.map((m) => m.width).join("/"), `${largest.width}x${largest.height}`);
  }
  fs.writeFileSync(DATA, JSON.stringify(table, null, 2) + "\n");
  console.log("wrote", DATA);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
