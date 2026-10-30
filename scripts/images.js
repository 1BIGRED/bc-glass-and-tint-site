// v3 responsive image pipeline (WS6, engineering 3.9). Run by a person when a photo is added or a
// crop changes; the outputs are committed, so nothing is re-encoded on Netlify:
//
//   node scripts/images.js --sync     copy the source photos listed in images-src/v3/manifest.json
//                                     from the client photo library (READ ONLY) into images-src/v3/
//                                     as working masters (max 2400 px wide; hero masters keep full size)
//   node scripts/images.js            build images/v3/*.{avif,webp,jpg} and _data/images.json
//   node scripts/images.js --force    rebuild every image even when its signature is unchanged
//   node scripts/images.js --only a,b build only those ids
//
// Source of truth for what ships is images-src/v3/manifest.json. The library is never modified:
// --sync only reads from it. scripts/v2-images.js (v2 pages) is untouched and keeps working.
//
// Output per id, never upscaled past the crop's own pixels:
//   images/v3/<id>-<w>.avif  q45     images/v3/<id>-<w>.webp  q70     images/v3/<id>-<w>.jpg  q78 mozjpeg
// Metadata (EXIF, GPS) is not carried over; colour is converted to sRGB.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "images-src", "v3");
const OUT = path.join(ROOT, "images", "v3");
const DATA = path.join(ROOT, "_data", "images.json");
const MANIFEST = path.join(SRC, "manifest.json");
// The one place photos may come from (read only). Override with BC_PHOTO_LIBRARY on another PC.
const LIBRARY_ROOT =
  process.env.BC_PHOTO_LIBRARY || path.join(ROOT, "..", "..", "03 - Client Photos");

const STD_WIDTHS = [480, 640, 960, 1280, 1800];
const GROUP_MAX = { gallery: 1280, page: 1800, hero: 1800 };
const WORKING_MAX_WIDTH = 2400;
const URL_BASE = "/images/v3/";
const SIZES_FALLBACK = 960;
const Q = { avif: 45, webp: 70, jpg: 78 };

// Art direction 5.3 and the CEO rulings: never ship any of these, whatever a manifest says.
const DO_NOT_USE = [
  [/shop-brand[\\/].*plaza-lot-through-glass/i, "plaza shot: photographer's hand and phone reflected in the glass"],
  [/bc-shed-sinclair/i, "red roll-door shed is not the shop"],
  [/(^|[\\/])lifestyle[\\/]/i, "lifestyle/: vendor imagery of unknown license"],
  [/04 - Stock Photos/i, "stock photo"],
  [/AI-HIGGSFIELD|AI-RUNWAY|AdobeStock/i, "AI or stock image"],
  [/BC-Glass-Tint-site/i, "old site image (stock or parade)"],
  [/stucco-arched-window-scaffold/i, "customer address visible"],
  [/exterior-modern-two-story-scaffold/i, "person on scaffold: waits on Chase's ruling"],
  [/white-ram-2500-truck/i, "National Park Service vehicle"],
  [/cover-shop-f150/i, "customer truck hides the sign"],
  [/bullseye-chip-interior-wide/i, "cabin clutter frame"]
];

function die(msg) {
  console.error("images.js: " + msg);
  process.exit(1);
}

function readManifest() {
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8").replace(new RegExp("^" + String.fromCharCode(0xFEFF)), ""));
  const seen = new Set();
  m.images.forEach((e) => {
    if (!e.id || !/^[a-z0-9][a-z0-9-]*$/.test(e.id)) die("bad id: " + e.id);
    if (seen.has(e.id)) die("duplicate id: " + e.id);
    seen.add(e.id);
  });
  return m.images;
}

function checkAlt(label, alt) {
  if (typeof alt !== "string" || alt.trim() === "") die(label + ": alt text is required");
  if (new RegExp("["+String.fromCharCode(0x2013)+String.fromCharCode(0x2014)+"]").test(alt)) die(label + ": alt text contains an en or em dash");
  if (new RegExp("[" + String.fromCodePoint(0x1F000) + "-" + String.fromCodePoint(0x1FFFF) + String.fromCharCode(0x2600) + "-" + String.fromCharCode(0x27BF) + "]", "u").test(alt)) die(label + ": alt text contains an emoji");
}

function checkSource(rel) {
  DO_NOT_USE.forEach(([re, why]) => {
    if (re.test(rel)) die("source " + rel + " is on the do-not-use list (" + why + ")");
  });
  if (!/^photo-library[\\/]/.test(rel)) die("source " + rel + " must live under photo-library/");
}

// ---------------------------------------------------------------- sync (library -> images-src/v3)
async function sync(entries) {
  const done = new Set();
  const jobs = [];
  entries.forEach((e) => {
    if (e.alias) return;
    jobs.push({ master: e.master, src: e.src, keepFull: !!e.keepFull });
    if (e.phone && e.phone.master) jobs.push({ master: e.phone.master, src: e.phone.src, keepFull: false });
  });
  for (const j of jobs) {
    if (done.has(j.master)) continue;
    done.add(j.master);
    checkSource(j.src);
    const from = path.join(LIBRARY_ROOT, j.src);
    if (!fs.existsSync(from)) die("missing in the library: " + from);
    const to = path.join(SRC, j.master + ".jpg");
    const meta = await sharp(from).metadata();
    const upright = !meta.orientation || meta.orientation === 1;
    if (j.keepFull && upright && /\.jpe?g$/i.test(from)) {
      fs.copyFileSync(from, to);
      console.log("sync (copy)  ", j.master, meta.width + "x" + meta.height);
    } else {
      let p = sharp(from).rotate();
      const w = meta.orientation && meta.orientation >= 5 ? meta.height : meta.width;
      if (!j.keepFull && w > WORKING_MAX_WIDTH) p = p.resize({ width: WORKING_MAX_WIDTH });
      await p.jpeg({ quality: j.keepFull ? 95 : 90, mozjpeg: true }).toFile(to);
      const m2 = await sharp(to).metadata();
      console.log("sync (encode)", j.master, m2.width + "x" + m2.height);
    }
  }
}

// ---------------------------------------------------------------- crops
function cropFor(crop, mw, mh, focal) {
  let x, y, w, h;
  if (crop.ref) {
    const sx = mw / crop.ref[0];
    const sy = mh / crop.ref[1];
    x = crop.x * sx; y = crop.y * sy; w = crop.w * sx; h = crop.h * sy;
  } else if (crop.fw != null) {
    x = crop.fx * mw; y = crop.fy * mh; w = crop.fw * mw; h = crop.fh * mh;
  } else if (crop.aspect) {
    const [a, b] = crop.aspect.split(":").map(Number);
    const r = a / b;
    w = mw; h = mw / r;
    if (h > mh) { h = mh; w = mh * r; }
    const f = focal || { x: 0.5, y: 0.5 };
    x = Math.min(Math.max(f.x * mw - w / 2, 0), mw - w);
    y = Math.min(Math.max(f.y * mh - h / 2, 0), mh - h);
  } else die("crop needs ref, fractions or aspect");
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (x < 0 || y < 0 || x + w > mw + 1 || y + h > mh + 1) die("crop outside the master: " + JSON.stringify({ x, y, w, h, mw, mh }));
  w = Math.min(w, mw - x); h = Math.min(h, mh - y);
  return { left: x, top: y, width: w, height: h };
}

function widthsFor(cropW, group) {
  const max = GROUP_MAX[group] || 1800;
  const list = STD_WIDTHS.filter((w) => w <= cropW && w <= max);
  const top = list.length ? list[list.length - 1] : 0;
  // add the crop's own width when it is clearly wider than the largest standard step (hero crops)
  if (cropW > top * 1.1 && cropW <= max * 1.2 && !list.includes(cropW)) list.push(cropW);
  if (!list.length) list.push(cropW);
  return list;
}

function exposureFactor(ev) {
  // EV in linear light -> multiplier on sRGB values
  return Math.pow(Math.pow(2, ev), 1 / 2.2);
}

async function renderVariant(id, masterName, crop, focal, group, exposure) {
  const masterPath = path.join(SRC, masterName + ".jpg");
  if (!fs.existsSync(masterPath)) die("working master missing, run --sync first: " + masterPath);
  const meta = await sharp(masterPath).metadata();
  const c = cropFor(crop, meta.width, meta.height, focal);
  const widths = widthsFor(c.width, group);
  const files = { avif: [], webp: [], jpg: [] };
  // AVIF carries every width. WebP and JPEG are fallbacks for the few browsers without AVIF, so they
  // carry fewer widths (committed bytes). WebP: up to 1280 without the 640 step (gallery tiles stop at 960). JPEG: 640 and 960
  // only (the <img> src is the 960). Never a width above the crop's own pixels.
  const webpW = widths.filter((w) => w <= 1280 && w !== 640 && !(group === "gallery" && w === 1280));
  const jpgW = widths.filter((w) => w === 640 || w === 960);
  if (!webpW.length) webpW.push(widths[widths.length - 1]);
  if (!jpgW.length) jpgW.push(widths[widths.length - 1]);
  for (const w of widths) {
    const h = Math.round((c.height * w) / c.width);
    const base = () => {
      let p = sharp(masterPath).extract(c).resize({ width: w, height: h, kernel: "lanczos3" });
      if (exposure) p = p.linear(exposureFactor(exposure), 0);
      return p;
    };
    const stem = id + "-" + w;
    const jobs = [base().avif({ quality: Q.avif, effort: 4 }).toFile(path.join(OUT, stem + ".avif"))];
    files.avif.push({ url: URL_BASE + stem + ".avif", width: w, height: h });
    if (webpW.includes(w)) {
      jobs.push(base().webp({ quality: Q.webp }).toFile(path.join(OUT, stem + ".webp")));
      files.webp.push({ url: URL_BASE + stem + ".webp", width: w, height: h });
    }
    if (jpgW.includes(w)) {
      jobs.push(base().jpeg({ quality: Q.jpg, mozjpeg: true, progressive: true }).toFile(path.join(OUT, stem + ".jpg")));
      files.jpg.push({ url: URL_BASE + stem + ".jpg", width: w, height: h });
    }
    await Promise.all(jobs);
  }
  return { crop: c, widths, files };
}

function srcset(list) {
  return list.map((m) => m.url + " " + m.width + "w").join(", ");
}

function itemFrom(v, focal) {
  const jpg = v.files.jpg;
  const largest = v.files.avif[v.files.avif.length - 1];
  const fb = jpg.filter((m) => m.width <= SIZES_FALLBACK).pop() || jpg[0];
  const f = focal || { x: 0.5, y: 0.5 };
  return {
    width: largest.width,
    height: largest.height,
    fallback: fb.url,
    avif: srcset(v.files.avif),
    webp: srcset(v.files.webp),
    jpeg: srcset(jpg),
    first_avif: v.files.avif[0].url,
    widths: v.widths,
    focal: { x: f.x, y: f.y },
    pos: Math.round(f.x * 100) + "% " + Math.round(f.y * 100) + "%"
  };
}

function signature(e, masterNames) {
  const h = crypto.createHash("sha1");
  h.update(JSON.stringify(e));
  h.update(JSON.stringify([Q, STD_WIDTHS, GROUP_MAX]));
  masterNames.forEach((n) => {
    const p = path.join(SRC, n + ".jpg");
    if (fs.existsSync(p)) {
      const s = fs.statSync(p);
      h.update(n + ":" + s.size);
    }
  });
  return h.digest("hex").slice(0, 12);
}

function filesOf(item) {
  const out = [];
  ["avif", "webp", "jpeg"].forEach((k) => {
    (item[k] || "").split(",").forEach((s) => {
      const u = s.trim().split(" ")[0];
      if (u) out.push(u);
    });
  });
  return out;
}

function toDisk(url) {
  return path.join(ROOT, url.replace(/^\//, "").split("/").join(path.sep));
}

// ---------------------------------------------------------------- build
async function build(entries, opts) {
  fs.mkdirSync(OUT, { recursive: true });
  const prev = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : {};
  const table = {};
  for (const e of entries) {
    if (e.alias) continue;
    checkSource(e.src);
    checkAlt(e.id, e.alt);
    if (e.phone && e.phone.src) checkSource(e.phone.src);
    if (opts.only && !opts.only.includes(e.id)) {
      if (prev[e.id]) table[e.id] = prev[e.id];
      continue;
    }
    const masters = [e.master].concat(e.phone && e.phone.master ? [e.phone.master] : [e.master]);
    const sig = signature(e, masters);
    const old = prev[e.id];
    if (!opts.force && old && old.sig === sig && filesOf(old).concat(old.phone ? filesOf(old.phone) : []).every((u) => fs.existsSync(toDisk(u)))) {
      table[e.id] = old;
      console.log("keep ", e.id);
      continue;
    }
    const v = await renderVariant(e.id, e.master, e.crop, e.focal, e.group, e.exposure || 0);
    const item = itemFrom(v, e.focal);
    item.alt = e.alt;
    item.group = e.group;
    item.aspect = v.crop.width + "/" + v.crop.height;
    if (e.use) item.use = e.use;
    if (e.note) item.note = e.note;
    if (e.needs_ruling) item.needs_ruling = e.needs_ruling;
    item.source = e.src;
    if (e.phone) {
      const pm = e.phone.master || e.master;
      const pv = await renderVariant(e.id + "-phone", pm, e.phone.crop, e.phone.focal, e.group, e.exposure || 0);
      const pitem = itemFrom(pv, e.phone.focal);
      pitem.sizes = e.phone.sizes || "100vw";
      pitem.aspect = pv.crop.width + "/" + pv.crop.height;
      item.phone = pitem;
    }
    item.sig = sig;
    table[e.id] = item;
    console.log("built", e.id, item.width + "x" + item.height, "widths", v.widths.join("/"), e.phone ? "(+phone)" : "");
  }
  entries.forEach((e) => {
    if (!e.alias) return;
    checkAlt(e.id, e.alt);
    const target = table[e.alias];
    if (!target) die(e.id + ": alias target " + e.alias + " not built");
    const copy = JSON.parse(JSON.stringify(target));
    copy.alt = e.alt;
    copy.alias_of = e.alias;
    if (e.use) copy.use = e.use;
    delete copy.sig;
    table[e.id] = copy;
  });
  // logo: 3x raster of the displayed size, from the original raster (never redrawn)
  await buildLogo(table);
  const ordered = {};
  Object.keys(table).sort().forEach((k) => (ordered[k] = table[k]));
  fs.writeFileSync(DATA, JSON.stringify(ordered, null, 2) + "\n");
  console.log("wrote", path.relative(ROOT, DATA), Object.keys(ordered).length, "entries");
  return ordered;
}

async function buildLogo(table) {
  const from = path.join(ROOT, "logo.png"); // 1612 x 600 original raster
  if (!fs.existsSync(from)) return;
  const h = 120; // displayed 40 px tall at 3x
  const m = await sharp(from).metadata();
  const w = Math.round((m.width * h) / m.height);
  const png = path.join(OUT, "logo-" + h + ".png");
  const webp = path.join(OUT, "logo-" + h + ".webp");
  await sharp(from).resize({ width: w, height: h, kernel: "lanczos3" }).png({ compressionLevel: 9, palette: false }).toFile(png);
  await sharp(from).resize({ width: w, height: h, kernel: "lanczos3" }).webp({ lossless: true }).toFile(webp);
  table["_logo"] = {
    png: URL_BASE + "logo-" + h + ".png",
    webp: URL_BASE + "logo-" + h + ".webp",
    width: w,
    height: h,
    display_height: 40,
    display_width: Math.round((w * 40) / h),
    note: "3x the displayed 40 px height; replaces the 640 x 238 logo-hero.png shown at about 108 x 40"
  };
  console.log("logo", w + "x" + h);
}

(async () => {
  const args = process.argv.slice(2);
  const opts = { force: args.includes("--force"), only: null };
  const oi = args.indexOf("--only");
  if (oi >= 0 && args[oi + 1]) opts.only = args[oi + 1].split(",");
  const entries = readManifest();
  if (args.includes("--sync")) {
    await sync(entries);
    return;
  }
  await build(entries, opts);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
