// WS6 format inventory over a built folder (PB1.5a):  node tests/ws6-inventory.js _site-ws6
// Every <img> inside <picture> needs an AVIF and a WebP <source>, width, height, alt; a fetchpriority
// high image is not lazy; at most one image preload per viewport. Photos outside <picture> are listed.
const fs = require("fs");
const path = require("path");
const dir = process.argv[2] || "_site-ws6";
function walk(d, out) {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  });
  return out;
}
let bad = 0, pics = 0, pages = 0, loose = [];
walk(dir, []).forEach((f) => {
  const h = fs.readFileSync(f, "utf8");
  const rel = path.relative(dir, f).split(path.sep).join("/");
  const pre = (h.match(/<link rel="preload" as="image"/g) || []).length;
  const pictures = h.match(/<picture[\s\S]*?<\/picture>/g) || [];
  let any = false;
  pictures.forEach((p) => {
    pics++; any = true;
    const img = (p.match(/<img[^>]*>/) || [""])[0];
    const probs = [];
    if (!/<source[^>]*type="image\/avif"/.test(p)) probs.push("no avif source");
    if (!/<source[^>]*type="image\/webp"/.test(p)) probs.push("no webp source");
    ["width", "height"].forEach((a) => { if (!new RegExp("\\s" + a + '="\\d+"').test(img)) probs.push("no " + a); });
    if (!/\salt="/.test(img)) probs.push("no alt");
    if (/fetchpriority="high"/.test(img) && /loading="lazy"/.test(img)) probs.push("lcp image is lazy");
    if (probs.length) { bad++; console.log("BAD  " + rel + ": " + probs.join(", ") + "  " + img.slice(0, 120)); }
  });
  if (any) pages++;
  const outside = (h.replace(/<picture[\s\S]*?<\/picture>/g, "").match(/<img[^>]*>/g) || []).filter((t) => !/logo|icon|sprite/i.test(t));
  if (outside.length) loose.push(rel + " (" + outside.length + ")");
  if (pre > 2) { bad++; console.log("BAD  " + rel + ": " + pre + " image preloads"); }
});
console.log("pages with <picture>: " + pages + ", <picture> elements: " + pics + ", problems: " + bad);
console.log("photo <img> outside <picture>: " + (loose.length ? loose.join(", ") : "none"));
process.exit(bad ? 1 : 0);
