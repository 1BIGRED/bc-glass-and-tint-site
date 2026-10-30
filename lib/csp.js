// Content-Security-Policy script hashes (peak pass R2 part A, technical 4). Not an Eleventy plugin.
//
// The live policy is still REPORT-ONLY (netlify.toml). Enforcing it needs the exact sha256 of every
// inline script the site serves, because 'unsafe-inline' leaves script-src. Those hashes change
// whenever a head script changes (head/ga4.njk, head/clarity.njk, the critical CSS loader in
// .eleventy.js), so they are computed here from the built pages, never typed by hand:
//
//   inlineScriptHashes(outDir) -> { "sha256-...": [page, ...] }   executable inline <script>s only
//                                 (no src, no JSON or JSON-LD type); /admin/ (its own policy) and
//                                 preview.html (kept off the live domain by _redirects) are skipped
//   checkToml(tomlText, hashes) -> { missing: [...], extra: [...] } for the script-src of the
//                                 Report-Only line and of the commented "ready to flip" line
//
// .eleventy.js runs both after a production build and prints the result; a mismatch is a loud
// warning (report-only today, so a stale hash only logs console reports). Print the current hashes:
//   node lib/csp.js _site-r2a-prod
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

function inlineScriptHashes(outDir) {
  const root = path.resolve(outDir);
  const out = {};
  walk(root).forEach((file) => {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (rel.startsWith("admin/") || rel === "preview.html") return;
    const html = fs.readFileSync(file, "utf8");
    const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
      const attrs = m[1] || "";
      if (/\ssrc\s*=/i.test(attrs)) continue;
      const type = (/\stype\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1];
      if (type && !/^(text\/javascript|application\/javascript|module)$/i.test(type)) continue;
      const h = "sha256-" + crypto.createHash("sha256").update(m[2], "utf8").digest("base64");
      (out[h] = out[h] || []).push(rel);
    }
  });
  return out;
}

// the script-src hashes of one CSP header line in netlify.toml (commented or not)
function hashesInLine(line) {
  const m = /script-src([^;]*)/.exec(line || "");
  return m ? (m[1].match(/'sha256-[A-Za-z0-9+/=]+'/g) || []).map((s) => s.slice(1, -1)) : [];
}

function checkToml(tomlText, hashes) {
  const want = Object.keys(hashes).sort();
  const lines = String(tomlText).split(/\r?\n/);
  const ro = lines.find((l) => /^\s*Content-Security-Policy-Report-Only\s*=/.test(l) && /script-src 'self' 'sha256-/.test(l));
  const flip = lines.find((l) => /^\s*#\s*Content-Security-Policy\s*=/.test(l));
  function diff(have) {
    return { missing: want.filter((h) => have.indexOf(h) < 0), extra: have.filter((h) => want.indexOf(h) < 0) };
  }
  return { reportOnly: ro ? diff(hashesInLine(ro)) : null, flip: flip ? diff(hashesInLine(flip)) : null };
}

module.exports = { inlineScriptHashes, checkToml, hashesInLine };

if (require.main === module) {
  const dir = process.argv[2] || "_site";
  const h = inlineScriptHashes(dir);
  Object.keys(h).forEach((k) => console.log("'" + k + "'  " + h[k].length + " pages, e.g. " + h[k].slice(0, 3).join(", ")));
  const toml = fs.readFileSync(path.join(__dirname, "..", "netlify.toml"), "utf8");
  console.log(JSON.stringify(checkToml(toml, h)));
}
