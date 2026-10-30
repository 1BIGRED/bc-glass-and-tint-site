// WS6 media macro test, no framework:  node tests/ws6-media.test.js
// Renders _includes/v3/media.njk with the real _data/images.json and checks the markup rules of
// engineering 3.9: AVIF and WebP sources, width, height, alt, hero priority, lazy loading,
// art direction, CMS uploads through Image CDN, and the build errors for missing or bad alt.
const path = require("path");
const fs = require("fs");
const nunjucks = require("nunjucks");
const ws6 = require("../lib/eleventy-ws6.js");

const ROOT = path.join(__dirname, "..");
const images = JSON.parse(fs.readFileSync(path.join(ROOT, "_data", "images.json"), "utf8"));
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(ROOT, "_includes")), { autoescape: true });
env.addFilter("picAlt", ws6.picAlt);
env.addFilter("cdnSet", ws6.cdnSet);
env.addFilter("requireValue", (v, m) => {
  if (v == null || String(v).trim() === "") throw new Error(m);
  return v;
});

let fails = 0;
function check(name, ok, extra) {
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!ok) fails++;
}
function render(tpl, ctx) {
  return env.renderString('{% from "v3/media.njk" import picture, preload %}' + tpl, Object.assign({ images }, ctx || {}));
}
function throws(tpl, ctx, re) {
  try {
    render(tpl, ctx);
    return false;
  } catch (e) {
    return re.test(String(e.message || e));
  }
}
const count = (s, re) => (s.match(re) || []).length;

// 1. plain photo (gallery tile), lazy
let h = render('{{ picture(images["porsche-taycan-front-three-quarter"], "(min-width: 1024px) 33vw, 50vw") }}');
check("tile: AVIF then WebP source", /<source type="image\/avif"[^>]*>\s*<source type="image\/webp"/.test(h));
check("tile: img has src srcset sizes width height alt", /<img src="\/images\/v3\/porsche-taycan-front-three-quarter-960\.jpg" srcset="[^"]+" sizes="[^"]+" width="1280" height="960" alt="[^"]+"/.test(h));
check("tile: lazy and async, no fetchpriority", /loading="lazy"/.test(h) && /decoding="async"/.test(h) && !/fetchpriority/.test(h));

// 2. hero: high priority, no loading attribute, art directed phone sources
h = render('{{ picture(images["storefront-hero"], "(min-width: 1024px) 50vw, 100vw", { high: true }) }}');
check("hero: fetchpriority high, no loading attribute", /fetchpriority="high"/.test(h) && !/loading=/.test(h));
check("hero: phone AVIF, WebP and JPEG sources with media", count(h, /<source media="\(max-width: 1023px\)"/g) === 3);
check("hero: desktop AVIF and WebP sources", count(h, /<source type="image\/(avif|webp)"/g) === 2);
check("hero: data-art with both aspect ratios", /data-art style="object-position:45% 60%;--ar-d:1256\/1196;--ar-m:1280\/1024"/.test(h));

// 3. preload
const p = render('{{ preload(images["storefront-hero"], "(min-width: 1024px) 50vw, 100vw") }}');
check("preload: one link per media query, AVIF, high", count(p, /<link rel="preload" as="image" type="image\/avif"/g) === 2 && count(p, /fetchpriority="high"/g) === 2);
check("preload: desktop imagesizes equals the img sizes", p.indexOf('imagesizes="(min-width: 1024px) 50vw, 100vw"') > -1);
const p1 = render('{{ preload(images["storefront-wide"], "100vw") }}');
check("preload: a plain item prints exactly one link", count(p1, /<link /g) === 1);

// 4. alt rules
check("no alt: build error naming the image", throws('{{ picture(item, "100vw") }}', { item: { fallback: "/images/v3/x-960.jpg", avif: "a 1w", width: 1, height: 1 } }, /alt text is required for \/images\/v3\/x-960\.jpg/));
check("decorative: alt is empty and no error", /alt=""/.test(render('{{ picture(item, "100vw", { decorative: true }) }}', { item: { fallback: "/a.jpg", width: 1, height: 1 } })));
check("alt override wins over item.alt", /alt="Override text"/.test(render('{{ picture(images["storefront-wide"], "100vw", { alt: "Override text" }) }}')));
check("em dash in alt fails", throws('{{ picture(item, "100vw") }}', { item: { fallback: "/a.jpg", width: 1, height: 1, alt: "bad " + String.fromCharCode(0x2014) + " dash" } }, /em dash/));
check("en dash in alt fails", throws('{{ picture(item, "100vw") }}', { item: { fallback: "/a.jpg", width: 1, height: 1, alt: "bad " + String.fromCharCode(0x2013) + " dash" } }, /en or em dash|dash/));
check("quotes in alt are escaped", /alt="Say &quot;hi&quot;"/.test(render('{{ picture(item, "100vw") }}', { item: { fallback: "/a.jpg", width: 1, height: 1, alt: 'Say "hi"' } })));
check("missing item: named error", throws("{{ picture(nothing, '100vw') }}", {}, /image data is missing/));

// 5. CMS upload through Image CDN: explicit fm, JPEG original as the img
h = render('{{ picture(up, "50vw") }}', { up: { cdn: true, src: "/images/uploads/a.jpg", width: 1000, height: 750, alt: "Upload" } });
check("cdn: AVIF and WebP via /.netlify/images with explicit fm", /\/\.netlify\/images\?url=\/images\/uploads\/a\.jpg&amp;w=640&amp;fm=avif 640w/.test(h) && /fm=webp 960w/.test(h) && !/w=1280/.test(h));
check("cdn: img src is the upload", /<img src="\/images\/uploads\/a\.jpg"/.test(h));

// 6. data rules: every entry in images.json
let bad = 0;
Object.keys(images).forEach((id) => {
  if (id === "_logo") return;
  const it = images[id];
  if (!it.alt || !it.width || !it.height || !it.avif || !it.webp || !it.jpeg || !it.fallback) bad++;
});
check("images.json: every entry has alt, width, height, avif, webp, jpeg, fallback", bad === 0, "(" + Object.keys(images).length + " entries)");
let missing = 0;
try {
  ws6.checkImagesData();
} catch (e) {
  missing++;
  console.log(String(e.message));
}
check("images.json: every named file exists on disk, no dashes in alt", missing === 0);

console.log(fails ? "\nFAILED: " + fails : "\nALL PASS");
process.exit(fails ? 1 : 0);
