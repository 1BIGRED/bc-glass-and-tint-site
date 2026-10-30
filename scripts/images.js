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
  [/BC-Glass-Tint-site/i, "old site image (stock or parade)"],   // lifted for ONE file only, see PARADE_FRAME
  [/stucco-arched-window-scaffold/i, "customer address visible"],
  [/exterior-modern-two-story-scaffold/i, "person on scaffold: waits on Chase's ruling"],
  [/white-ram-2500-truck/i, "National Park Service vehicle"],
  [/cover-shop-f150/i, "customer truck hides the sign"],
  [/bullseye-chip-interior-wide/i, "cabin clutter frame"]
];

// ONE exception to the old-site block above. Chase, by text 2026-10-29 10:03 PM: "Let's do the same
// picture as the current." The live homepage hero is the Boulder City parade frame (BC's sign truck and
// the gold BC van), file 09 - Website/BC-Glass-Tint-site/images/hero.jpg. Logged in decisions-log.md
// (2026-10-29 22:03 text). Exactly that path, read only, is allowed (and may sit outside photo-library/);
// every other file in BC-Glass-Tint-site stays blocked, and so does every other block in the list.
// Treatment is set in the manifest entry: a crop that keeps the truck and van as the subject and the
// parade walkers out of frame. No plate blur: client rule (decisions-and-rules line 116, 2026-07-23)
// says visible plates are fine, no blur, no crop, no hold (CEO ruling, peak pass R1 2026-10-30).
const PARADE_FRAME = /^\.\.[\\/]09 - Website[\\/]BC-Glass-Tint-site[\\/]images[\\/]hero\.jpg$/i;

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
  if (PARADE_FRAME.test(rel)) return; // Chase's 2026-10-29 10:03 PM ruling, this one frame only
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

// Optional local blur over regions of a master (manifest field "blur": [{ref:[w,h], x, y, w, h, sigma}]),
// used for a license plate. Returns the master path, or a lossless PNG buffer with the regions blurred
// (feathered edge). Cached per master and region list. The working master on disk is never changed.
const blurCache = new Map();
async function masterInput(masterPath, blurs) {
  if (!blurs || !blurs.length) return masterPath;
  const key = masterPath + JSON.stringify(blurs);
  if (blurCache.has(key)) return blurCache.get(key);
  const meta = await sharp(masterPath).metadata();
  let base = await sharp(masterPath).png({ compressionLevel: 1 }).toBuffer();
  for (const b of blurs) {
    const sx = b.ref ? meta.width / b.ref[0] : 1;
    const sy = b.ref ? meta.height / b.ref[1] : 1;
    const left = Math.round(b.x * sx), top = Math.round(b.y * sy);
    const width = Math.round(b.w * sx), height = Math.round(b.h * sy);
    const pad = Math.max(2, Math.round(Math.min(width, height) * 0.12));
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><rect x="' + pad + '" y="' + pad + '" width="' + (width - 2 * pad) + '" height="' + (height - 2 * pad) + '" rx="' + pad + '" fill="#fff"/></svg>');
    const mask = await sharp(svg).blur(Math.max(0.5, pad / 3)).png().toBuffer();
    let patch = await sharp(base).extract({ left, top, width, height }).blur(b.sigma || 4).ensureAlpha().png().toBuffer();
    patch = await sharp(patch).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    base = await sharp(base).composite([{ input: patch, left, top }]).png({ compressionLevel: 1 }).toBuffer();
  }
  blurCache.set(key, base);
  return base;
}

// Optional global colour correction (manifest field "grade": { "rgb": [r, g, b], "saturation": s }).
// Corrective only, the same on every pixel (no local edits, no AI): per-channel multipliers on the
// sRGB values, then a saturation factor. Added in fixes B 2026-10-29 for the teal cast on the shop-bay
// chip repair frames (visual audit finding 4: one warm-neutral treatment beside the warm stucco frames).
function applyGrade(p, grade) {
  if (!grade) return p;
  if (Array.isArray(grade.rgb) && grade.rgb.length === 3) {
    grade.rgb.forEach((v) => { if (typeof v !== "number" || v < 0.85 || v > 1.15) die("grade.rgb values must be numbers from 0.85 to 1.15 (corrective only)"); });
    p = p.linear(grade.rgb, [0, 0, 0]);
  }
  if (grade.saturation != null) {
    if (typeof grade.saturation !== "number" || grade.saturation < 0.7 || grade.saturation > 1.1) die("grade.saturation must be a number from 0.7 to 1.1 (corrective only)");
    p = p.modulate({ saturation: grade.saturation });
  }
  return p;
}

// Optional global tonal pass (manifest field "tone"), peak pass R1 2026-10-30 (visual finding 2a and
// gallery G3). Lightroom-style sliders, the same function on every pixel (no local edit, no mask, no
// AI), bounded so it can only correct, never restyle:
//   exposure      EV, -1 to 1 (linear light)
//   highlights    -60 to 60, acts on tones above mid grey (smooth ramp from luma 0.45)
//   whites        -60 to 60, acts on the top of the range only (from luma 0.7)
//   shadows       -60 to 60, acts on tones below mid grey (fades out by luma 0.5)
//   temperature   -15 to 15, warms (+) or cools (-) by trading red against blue
//   blue_saturation, blue_luminance   -40 to 40, a hue band centred on sky blue (215 deg, +/- 45 deg)
// Returns a lossless PNG buffer of the whole master; the working master on disk is never changed.
const TONE_LIMITS = { exposure: 1, highlights: 60, whites: 60, shadows: 60, temperature: 15, blue_saturation: 40, blue_luminance: 40 };
function checkTone(tone) {
  Object.keys(tone).forEach((k) => {
    if (k === "why" || k === "note") return;
    if (!(k in TONE_LIMITS)) die("tone." + k + " is not a known slider (" + Object.keys(TONE_LIMITS).join(", ") + ")");
    const v = tone[k];
    if (typeof v !== "number" || Math.abs(v) > TONE_LIMITS[k]) die("tone." + k + " must be a number from -" + TONE_LIMITS[k] + " to " + TONE_LIMITS[k] + " (corrective only)");
  });
}
function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function toSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function tonePixel(r, g, b, t, ev) {
  if (t.temperature) { r *= 1 + 0.0025 * t.temperature; b *= 1 - 0.0025 * t.temperature; }
  if (ev !== 1) { r = toSrgb(Math.min(1, toLin(Math.min(1, r)) * ev)); g = toSrgb(Math.min(1, toLin(g) * ev)); b = toSrgb(Math.min(1, toLin(Math.min(1, b)) * ev)); }
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let dy = 0;
  if (t.highlights) dy += (t.highlights / 100) * 0.35 * smooth(0.45, 1, y) * (y - 0.35);
  if (t.whites) dy += (t.whites / 100) * 0.2 * smooth(0.7, 1, y) * y;
  if (t.shadows) dy += (t.shadows / 100) * 0.3 * (1 - smooth(0, 0.5, y)) * (0.5 - y);
  if (dy && y > 0.002) { const k = (y + dy) / y; r *= k; g *= k; b *= k; } else if (dy) { r += dy; g += dy; b += dy; }
  if (t.blue_saturation || t.blue_luminance) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d > 0.004) {
      let h;
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
      const w = Math.max(0, 1 - Math.abs(h - 215) / 45) * Math.min(1, d / 0.08);
      if (w > 0) {
        const yy = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (t.blue_saturation) { const s = 1 + (t.blue_saturation / 100) * w; r = yy + (r - yy) * s; g = yy + (g - yy) * s; b = yy + (b - yy) * s; }
        if (t.blue_luminance) { const l = 1 + (t.blue_luminance / 100) * 0.6 * w; r *= l; g *= l; b *= l; }
      }
    }
  }
  return [r, g, b];
}
const toneCache = new Map();
async function toneInput(input, tone, cacheKey) {
  if (!tone) return input;
  checkTone(tone);
  const key = cacheKey + JSON.stringify(tone);
  if (toneCache.has(key)) return toneCache.get(key);
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ev = tone.exposure ? Math.pow(2, tone.exposure) : 1;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    const px = tonePixel(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, tone, ev);
    out[i] = Math.round(Math.min(1, Math.max(0, px[0])) * 255);
    out[i + 1] = Math.round(Math.min(1, Math.max(0, px[1])) * 255);
    out[i + 2] = Math.round(Math.min(1, Math.max(0, px[2])) * 255);
  }
  const png = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
  toneCache.set(key, png);
  return png;
}

async function renderVariant(id, masterName, crop, focal, group, exposure, blurs, grade, tone) {
  const masterPath = path.join(SRC, masterName + ".jpg");
  if (!fs.existsSync(masterPath)) die("working master missing, run --sync first: " + masterPath);
  const meta = await sharp(masterPath).metadata();
  const input = await toneInput(await masterInput(masterPath, blurs), tone, masterPath + JSON.stringify(blurs || []));
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
      let p = sharp(input).extract(c).resize({ width: w, height: h, kernel: "lanczos3" });
      if (exposure) p = p.linear(exposureFactor(exposure), 0);
      return applyGrade(p, grade);
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
    const v = await renderVariant(e.id, e.master, e.crop, e.focal, e.group, e.exposure || 0, e.blur, e.grade, e.tone);
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
      const pv = await renderVariant(e.id + "-phone", pm, e.phone.crop, e.phone.focal, e.group, e.exposure || 0, e.blur, e.grade, e.tone);
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
  // link-preview image: one 1200 x 630 crop of the real storefront (peak pass R1, technical 10)
  await buildOgShare(table);
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

// Link previews (og:image, twitter:image), peak pass R1 2026-10-30, technical finding 10: one 1200 x 630
// crop of the real storefront for pages without a photo of their own. Crop, size and alt live in
// lib/og-share.js (also read by lib/eleventy-og.js). The file is written next to the other renditions;
// it is not an images.json entry (that table holds picture() items only).
const OG = require(path.join(ROOT, "lib", "og-share.js"));
// eslint-disable-next-line no-unused-vars
async function buildOgShare(table) {
  const masterPath = path.join(SRC, OG.master + ".jpg");
  if (!fs.existsSync(masterPath)) return;
  checkAlt("_og", OG.alt);
  const meta = await sharp(masterPath).metadata();
  const c = cropFor(OG.crop, meta.width, meta.height);
  if (c.width < OG.width) die("og share crop is narrower than 1200 px (would upscale)");
  await sharp(masterPath).extract(c).resize({ width: OG.width, height: OG.height, kernel: "lanczos3", fit: "fill" })
    .jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(path.join(OUT, OG.file));
  console.log("og share", OG.width + "x" + OG.height, "from", JSON.stringify(c));
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
