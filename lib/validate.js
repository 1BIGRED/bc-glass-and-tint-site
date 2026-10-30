// Build guards for BC Glass & Tint (overhaul v3, WS1 Platform; engineering 3.2.1 and 3.2.6).
//
// Three checks, all wired in .eleventy.js (checkCmsConfig() also runs BEFORE the build: a
// field name in admin/config.yml that YAML reads as a number, boolean or null throws):
//
//   checkSiteData()   runs BEFORE the build. A bad value in _data/site.json (a malformed phone,
//                     an impossible closure date, a wrong analytics id) throws in every build
//                     context, so a bad CMS edit never publishes.
//   scanOutput()      runs AFTER the build over every built HTML file (and the CSS bundles for
//                     entries that ask). It checks the banned claims in _data/banned.json, every
//                     tel: and sms: link, and every phone number printed in visible text. In a
//                     production build (CONTEXT=production and no BC_NOINDEX) a hit throws and
//                     the build fails; in any other build it prints a warning.
//
// Run the data check by hand:   node lib/validate.js
// Scan a built folder by hand:  node lib/validate.js --scan _site-ws1 [--strict]

"use strict";

const fs = require("fs");
const path = require("path");
const platformLib = require("./platform");

const ROOT = path.join(__dirname, "..");
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function readJson(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

// ---------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------
function parseDate(s) {
  // "YYYY-MM-DD" that is a real calendar day -> a UTC Date at noon, else null.
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function isRealDate(s) {
  return parseDate(s) !== null;
}

function weekdayName(s) {
  const dt = parseDate(s);
  return dt ? DAY_NAMES[dt.getUTCDay()] : null;
}

function isTime(s) {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// ---------------------------------------------------------------------------------------
// 1. Site data (before the build)
// ---------------------------------------------------------------------------------------
// Returns { errors: [..], warnings: [..] }. Each message starts with the data path it is about.
function checkSite(site) {
  const errors = [];
  const warnings = [];
  const err = (p, msg) => errors.push("site.json " + p + ": " + msg);
  const warn = (p, msg) => warnings.push("site.json " + p + ": " + msg);
  const s = site || {};

  // Phone: tel is the one typed value; every other form must agree with it.
  const phone = s.phone || {};
  const tel = phone.tel;
  if (typeof tel !== "string" || !/^\+1\d{10}$/.test(tel)) {
    err("phone.tel", 'must be +1 and ten digits, like "+17025508840", got ' + JSON.stringify(tel));
  } else {
    const ten = tel.slice(2);
    ["display", "display_call", "schema"].forEach((k) => {
      if (phone[k] == null) return;
      const digits = String(phone[k]).replace(/\D/g, "");
      if (digits !== "1" + ten && digits !== ten) {
        err("phone." + k, "does not match phone.tel (" + tel + "), got " + JSON.stringify(phone[k]));
      }
    });
  }

  // Analytics and tag ids.
  if (typeof s.ga4_id !== "string" || !/^G-[A-Z0-9]+$/.test(s.ga4_id)) {
    err("ga4_id", 'must look like "G-ABC123", got ' + JSON.stringify(s.ga4_id));
  }
  if (s.google_ads_id != null && s.google_ads_id !== "" && !/^AW-\d+$/.test(String(s.google_ads_id))) {
    err("google_ads_id", 'must be empty or "AW-" and digits, got ' + JSON.stringify(s.google_ads_id));
  }
  if (typeof s.clarity_id !== "string" || !/^[a-z0-9]{8,12}$/.test(s.clarity_id)) {
    err("clarity_id", "must be 8 to 12 lowercase letters or digits, got " + JSON.stringify(s.clarity_id));
  }

  // Hours.
  const hours = s.hours || {};
  const openDays = [];
  if (!isTime(hours.opens)) err("hours.opens", 'must be "HH:MM", got ' + JSON.stringify(hours.opens));
  if (!isTime(hours.closes)) err("hours.closes", 'must be "HH:MM", got ' + JSON.stringify(hours.closes));
  if (isTime(hours.opens) && isTime(hours.closes) && hours.opens >= hours.closes) {
    err("hours", "opens (" + hours.opens + ") must be earlier than closes (" + hours.closes + ")");
  }
  if (!Array.isArray(hours.days) || !hours.days.length) {
    err("hours.days", "must be a list of weekday names");
  } else {
    hours.days.forEach((d) => {
      if (DAY_NAMES.indexOf(d) < 0) err("hours.days", "unknown day name " + JSON.stringify(d));
      else openDays.push(d);
    });
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: hours.timezone });
  } catch (e) {
    err("hours.timezone", "not a valid IANA time zone: " + JSON.stringify(hours.timezone));
  }

  // Closures and unknown days.
  const seen = {};
  const closures = s.closures == null ? [] : s.closures;
  const unknown = s.hours_unknown == null ? [] : s.hours_unknown;
  if (!Array.isArray(closures)) err("closures", "must be a list");
  if (!Array.isArray(unknown)) err("hours_unknown", "must be a list");
  (Array.isArray(closures) ? closures : []).forEach((c, i) => {
    const where = "closures[" + i + "]";
    if (!c || !isRealDate(c.date)) {
      err(where + ".date", 'must be a real calendar day written YYYY-MM-DD, got ' + JSON.stringify(c && c.date));
      return;
    }
    if (typeof c.reason !== "string" || !c.reason.trim()) err(where + ".reason", "is required (the status line prints it)");
    if (seen[c.date]) err(where + ".date", c.date + " is already listed in " + seen[c.date]);
    seen[c.date] = where;
    const wd = weekdayName(c.date);
    if (openDays.length && openDays.indexOf(wd) < 0) warn(where + ".date", c.date + " is a " + wd + ", a day the shop is already closed (harmless, but check the date)");
  });
  (Array.isArray(unknown) ? unknown : []).forEach((c, i) => {
    const where = "hours_unknown[" + i + "]";
    if (!c || !isRealDate(c.date)) {
      err(where + ".date", 'must be a real calendar day written YYYY-MM-DD, got ' + JSON.stringify(c && c.date));
      return;
    }
    if (seen[c.date]) err(where + ".date", c.date + " is already listed in " + seen[c.date] + " (a day is either closed or unknown, not both)");
    seen[c.date] = where;
  });

  // Reviews as-of date, when present, must be a real day.
  const rev = s.reviews || {};
  if (rev.as_of != null && rev.as_of !== "" && !isRealDate(rev.as_of)) {
    err("reviews.as_of", "must be a real calendar day written YYYY-MM-DD, got " + JSON.stringify(rev.as_of));
  }

  // Geo and origin sanity.
  ["latitude", "longitude"].forEach((k) => {
    const v = Number(s.geo && s.geo[k]);
    if (!isFinite(v)) err("geo." + k, "must be a number, got " + JSON.stringify(s.geo && s.geo[k]));
  });
  if (typeof s.origin !== "string" || !/^https:\/\/[^/]+$/.test(s.origin)) {
    err("origin", 'must be an https origin with no trailing slash, got ' + JSON.stringify(s.origin));
  }

  return { errors: errors, warnings: warnings };
}

function checkSiteData(opts) {
  opts = opts || {};
  const result = checkSite(opts.site || readJson("_data/site.json"));
  result.warnings.forEach((w) => console.warn("[bc-guard] WARNING " + w));
  if (result.errors.length) {
    throw new Error(
      "BC GUARD: _data/site.json failed validation, build stopped (" + result.errors.length + " problem" + (result.errors.length === 1 ? "" : "s") + "):\n  " +
        result.errors.join("\n  ")
    );
  }
  return result;
}

// ---------------------------------------------------------------------------------------
// 1b. CMS config (before the build). Peak pass R1, 2026-10-30, technical finding 1: six bare
// numeric field names (`name: 70`) parse as YAML numbers, and Sveltia refuses to start with
// "The name option must be a string". Any `name:` whose value YAML would read as a number,
// a boolean or null stops the build in every context, with the line numbers.
// ---------------------------------------------------------------------------------------
const CMS_BAD_NAME = /\bname:\s*(?:[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?|0x[0-9a-f]+|true|false|null|yes|no|on|off|~)\s*(?:[,}#]|$)/i;
function checkCmsConfig(opts) {
  opts = opts || {};
  const file = opts.file || path.join(ROOT, "admin", "config.yml");
  if (!fs.existsSync(file)) return { bad: [] };
  const text = opts.text != null ? String(opts.text) : fs.readFileSync(file, "utf8");
  const bad = [];
  // Peak pass R2 (technical 6): Sveltia ignores a file entry's own `description:` and a collection's
  // `delete:` (one console warning each), so help text put there never reaches the editor. Put it in
  // the hint of the file's first visible field instead. A file entry is a list item under `files:`
  // whose next lines carry `file:`; its own keys sit two spaces deeper than its "- ".
  const ignored = [];
  const lines = text.split(/\r?\n/);
  let filesIndent = -1, itemIndent = -1;
  lines.forEach((line, i) => {
    if (/^\s*#/.test(line)) return;
    if (CMS_BAD_NAME.test(line)) bad.push(i + 1);
    const ind = line.length - line.replace(/^\s+/, "").length;
    if (/^\s*files:\s*$/.test(line)) { filesIndent = ind; itemIndent = -1; return; }
    if (filesIndent >= 0 && line.trim() && ind <= filesIndent) filesIndent = -1;
    if (filesIndent >= 0 && /^\s*- /.test(line) && ind === filesIndent + 2) itemIndent = ind;
    if (filesIndent >= 0 && itemIndent >= 0 && ind === itemIndent + 2 && /^\s*description:/.test(line)) ignored.push(i + 1);
    if (/^ {4}delete:/.test(line)) ignored.push(i + 1);
  });
  if (bad.length) {
    throw new Error(
      "BC GUARD: admin/config.yml has a field name YAML reads as a number, boolean or null (the CMS will not start). Quote it, e.g. name: \"70\". Line" +
        (bad.length === 1 ? " " : "s ") + bad.join(", ")
    );
  }
  if (ignored.length) {
    throw new Error(
      "BC GUARD: admin/config.yml has a file-level description: or a collection delete: that Sveltia ignores, so editors never see it. Move the text into the first visible field's hint. Line" +
        (ignored.length === 1 ? " " : "s ") + ignored.join(", ")
    );
  }
  return { bad: bad };
}

// ---------------------------------------------------------------------------------------
// 2. Built output (after the build)
// ---------------------------------------------------------------------------------------
function decodeEntities(s) {
  return require("./schema").decodeEntities(s);
}

const INLINE_TAGS = /^(?:a|abbr|b|bdi|bdo|cite|code|data|dfn|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)$/i;

// The three surfaces a banned pattern can look at.
function surfacesOf(html) {
  let src = String(html).replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/gi, "");

  // JSON-LD blocks are part of the surface; every other script and style is not.
  const ld = [];
  src = src.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) ld.push(body);
    return " ";
  });
  src = src.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

  const attrBits = [];
  const metaBits = [];
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(src);
  if (titleMatch) metaBits.push(titleMatch[1]);

  // Walk the tags once: collect attribute text, meta content, then strip them for the text.
  const text = src.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (m, tag, attrs) => {
    const re = /\b([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    const got = {};
    while ((a = re.exec(attrs))) got[a[1].toLowerCase()] = a[2] != null ? a[2] : a[3];
    if (tag.toLowerCase() === "meta") {
      const key = (got.name || got.property || "").toLowerCase();
      if (got.content != null && /^(description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)$/.test(key)) {
        metaBits.push(got.content);
        attrBits.push(got.content);
      }
    }
    ["alt", "title", "aria-label", "placeholder", "data-label"].forEach((k) => {
      if (got[k] != null && tag.toLowerCase() !== "meta") attrBits.push(got[k]);
    });
    return INLINE_TAGS.test(tag) ? "" : " ";
  });

  const clean = (s) => decodeEntities(s).replace(/\s+/g, " ").trim();
  const ldText = ld.join(" ");
  const surface = clean(text) + " | " + attrBits.map(clean).join(" | ") + " | " + clean(titleMatch ? titleMatch[1] : "") + " | " + clean(ldText);
  return {
    surface: surface,
    visible: clean(text),
    meta: metaBits.map(clean).join(" | "),
    raw: String(html)
  };
}

function walk(dir, base, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (e.isDirectory()) walk(full, base, out);
    else out.push({ full: full, rel: rel });
  });
  return out;
}

function getPath(obj, p) {
  return String(p)
    .split(".")
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function skipped(entry, data) {
  const u = entry.unless;
  if (!u) return false;
  const v = getPath(data[u.file] || {}, u.path);
  if (u.nonEmpty) return Array.isArray(v) ? v.length > 0 : v != null && v !== "" && v !== false;
  if (u.contains) return typeof v === "string" && v.toLowerCase().indexOf(String(u.contains).toLowerCase()) > -1;
  return false;
}

function excerpt(text, index, len) {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + len + 30);
  return (start > 0 ? "..." : "") + text.slice(start, end).replace(/\s+/g, " ") + (end < text.length ? "..." : "");
}

// scanOutput(outDir, { strict, env, banned, site, platform })
// Returns { hits, filesScanned, strict }. Throws when strict and there is at least one hit.
function scanOutput(outDir, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const plat = platformLib.resolve(env);
  const strict = opts.strict != null ? !!opts.strict : plat.production;
  const mode = strict || plat.production ? "production" : "other";
  const banned = opts.banned || readJson("_data/banned.json");
  const site = opts.site || readJson("_data/site.json");
  const pdata = opts.platform || readJson("_data/platform.json");
  const data = { site: site, pricing: opts.pricing || (fs.existsSync(path.join(ROOT, "_data/pricing.json")) ? readJson("_data/pricing.json") : {}) };
  const skip = ((pdata.guards && pdata.guards.scan_skip) || []).map((s) => s.replace(/\\/g, "/"));
  const cssDir = (pdata.guards && pdata.guards.scan_css_dir) || "assets/h";

  const entries = (banned.entries || []).filter((e) => (!e.modes || e.modes.indexOf(mode) > -1) && !skipped(e, data));
  const compiled = entries.map((e) => ({ e: e, re: new RegExp(e.pattern, (e.flags == null ? "i" : e.flags) + "g") }));

  const files = walk(path.resolve(outDir), path.resolve(outDir), []);
  const hits = [];
  let scanned = 0;

  const telOk = String(site.phone && site.phone.tel);
  const telTen = telOk.replace(/\D/g, "").slice(-10);

  files.forEach((f) => {
    if (skip.some((p) => f.rel === p || f.rel.indexOf(p) === 0)) return;
    const isHtml = /\.html$/i.test(f.rel);
    const isCss = /\.css$/i.test(f.rel) && f.rel.indexOf(cssDir + "/") === 0;
    if (!isHtml && !isCss) return;
    scanned++;
    const text = fs.readFileSync(f.full, "utf8");

    if (isHtml) {
      const sf = surfacesOf(text);
      compiled.forEach((c) => {
        const files = c.e.files || ["html"];
        if (files.indexOf("html") < 0) return;
        const scope = c.e.scope || "surface";
        const target = scope === "raw" ? sf.raw : scope === "meta" ? sf.meta : sf.surface;
        c.re.lastIndex = 0;
        const m = c.re.exec(target);
        if (m) hits.push({ file: f.rel, id: c.e.id, row: c.e.row, match: m[0], context: excerpt(target, m.index, m[0].length), message: c.e.message });
      });

      // Every tel: and sms: link must carry the shop's number, exactly.
      const linkRe = /\bhref\s*=\s*["'](tel|sms):([^"']*)["']/gi;
      let lm;
      while ((lm = linkRe.exec(text))) {
        const scheme = lm[1].toLowerCase();
        const value = lm[2];
        const number = scheme === "sms" ? value.split(/[?&;]/)[0] : value;
        if (!/^\+1\d{10}$/.test(number)) {
          hits.push({ file: f.rel, id: "phone-link-malformed", row: "engineering 3.2.1", match: lm[0], context: lm[0], message: scheme + ": links must be +1 and ten digits." });
        } else if (number !== telOk) {
          hits.push({ file: f.rel, id: "phone-link-wrong-number", row: "engineering 3.2.1", match: lm[0], context: lm[0], message: scheme + ": link is not the shop number " + telOk + "." });
        }
      }
      // Every phone number printed in visible text must be the shop's number.
      const printed = /(?:\(\s*\d{3}\s*\)|\b\d{3})[\s.\-]*\d{3}[\s.\-]\d{4}\b/g;
      let pm;
      while ((pm = printed.exec(sf.visible))) {
        const digits = pm[0].replace(/\D/g, "");
        if (digits !== telTen) {
          hits.push({ file: f.rel, id: "phone-text-wrong-number", row: "engineering 3.2.1", match: pm[0], context: excerpt(sf.visible, pm.index, pm[0].length), message: "A phone number in the text is not the shop number." });
        }
      }
    } else if (isCss) {
      compiled.forEach((c) => {
        const files = c.e.files || ["html"];
        if (files.indexOf("css") < 0) return;
        c.re.lastIndex = 0;
        const m = c.re.exec(text);
        if (m) hits.push({ file: f.rel, id: c.e.id, row: c.e.row, match: m[0], context: excerpt(text, m.index, m[0].length), message: c.e.message });
      });
    }
  });

  // Sitemap completeness: every built page that carries a canonical tag (so it wants to be
  // indexed) is in sitemap.xml, and every sitemap URL is a page that was built.
  const sitemapFile = path.join(path.resolve(outDir), "sitemap.xml");
  if (fs.existsSync(sitemapFile)) {
    const xml = fs.readFileSync(sitemapFile, "utf8");
    const listed = {};
    xml.replace(/<loc>([^<]*)<\/loc>/g, (m, loc) => {
      listed[loc.replace(/^https?:\/\/[^/]+/, "") || "/"] = true;
      return m;
    });
    const sm = pdata.sitemap || {};
    const excluded = (sm.exclude_paths || []).concat([]);
    const builtPaths = {};
    files.forEach((f) => {
      if (!/\.html$/i.test(f.rel)) return;
      if (skip.some((p) => f.rel === p || f.rel.indexOf(p) === 0)) return;
      let p = "/" + f.rel;
      builtPaths[p] = true;
      if (p === "/index.html") builtPaths["/"] = true;
      else if (/\/index\.html$/.test(p)) builtPaths[p.slice(0, -"index.html".length)] = true;
      else builtPaths[p.slice(0, -".html".length)] = true;
      const html = fs.readFileSync(f.full, "utf8");
      const c = /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']*)["']/i.exec(html) || /<link\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*\brel\s*=\s*["']canonical["']/i.exec(html);
      if (!c) return;
      const cp = c[1].replace(/^https?:\/\/[^/]+/, "") || "/";
      if (excluded.indexOf(cp) > -1 || (sm.exclude_prefixes || []).some((x) => cp.indexOf(x) === 0)) return;
      if (!listed[cp]) hits.push({ file: f.rel, id: "sitemap-missing", row: "engineering 6 WS1", match: cp, context: "canonical " + cp + " is not in sitemap.xml", message: "A page that asks to be indexed is missing from sitemap.xml (a paginated template needs pagination.addAllPagesToCollections: true)." });
    });
    Object.keys(listed).forEach((u) => {
      if (!builtPaths[u] && !builtPaths[u.replace(/\/$/, "")]) hits.push({ file: "sitemap.xml", id: "sitemap-dead-url", row: "engineering 6 WS1", match: u, context: u + " is listed but no page was built there", message: "A sitemap URL has no built page." });
    });
  }

  if (hits.length) {
    const byId = {};
    hits.forEach((h) => {
      (byId[h.id] = byId[h.id] || []).push(h);
    });
    const lines = [];
    Object.keys(byId).forEach((id) => {
      const first = byId[id][0];
      lines.push("  [" + id + "] (" + first.row + ") " + byId[id].length + " hit" + (byId[id].length === 1 ? "" : "s") + ": " + first.message);
      byId[id].slice(0, 3).forEach((h) => lines.push("      " + h.file + ': "' + h.match + '"  ' + h.context));
      if (byId[id].length > 3) lines.push("      and " + (byId[id].length - 3) + " more in: " + Array.from(new Set(byId[id].slice(3).map((h) => h.file))).slice(0, 6).join(", "));
    });
    const head = "BC GUARD: banned claims and phone checks, " + hits.length + " hit" + (hits.length === 1 ? "" : "s") + " in " + scanned + " files (" + (strict ? "production build, FAILING" : "warning only, " + (plat.reasons.length ? plat.reasons.join(" + ") : plat.context) + " build") + "):\n";
    if (strict) throw new Error(head + lines.join("\n"));
    console.warn("[bc-guard] " + head + lines.join("\n"));
  }
  return { hits: hits, filesScanned: scanned, strict: strict };
}

module.exports = { checkSite, checkSiteData, checkCmsConfig, scanOutput, surfacesOf, isRealDate, parseDate, weekdayName };

// Command line:  node lib/validate.js            data check (site.json and admin/config.yml)
//                node lib/validate.js --scan <dir> [--strict]
if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    const r = checkSiteData();
    console.log("site data OK" + (r.warnings.length ? " (" + r.warnings.length + " warning" + (r.warnings.length === 1 ? "" : "s") + ")" : ""));
    checkCmsConfig();
    console.log("cms config names OK");
    const i = args.indexOf("--scan");
    if (i > -1) {
      const out = scanOutput(args[i + 1], { strict: args.indexOf("--strict") > -1 });
      console.log("scan OK: " + out.filesScanned + " files, " + out.hits.length + " hits");
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
