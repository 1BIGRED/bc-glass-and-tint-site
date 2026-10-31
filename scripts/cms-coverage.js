#!/usr/bin/env node
/*
  cms-coverage.js  (FA1, BC Glass & Tint website v3)

  Build-time gate. Compares the Sveltia CMS field paths in admin/config.yml with the keys that
  really exist in _data/*.json and _data/pages/*.json, and exits 1 on any mismatch. It is the
  Node port of the comparison half of 09 - Website/scripts/Test-CmsConfig.ps1 (the PowerShell
  test also runs the R1 to R11 rule checks; this script only guards coverage). Wired into
  `npm run build` so a data key with no CMS field (a value the office cannot edit, or that a CMS
  save could silently drop) stops the build instead of reaching a deploy.

  No dependencies: Node built-ins only. package.json carries no YAML package, so this file has the
  same small YAML reader the PowerShell test has (block maps and lists, flow maps and lists on one
  line, anchors and aliases, quoted and plain scalars).

  Fails (exit 1) on:
    ORPHAN (config)  a CMS field whose key does not exist in the data file
    ORPHAN (data)    a data key (leaf) that no CMS field or hidden field covers
    UNMAPPED FILE    a _data json file the config does not mention and that is not allowlisted
    TYPE MISMATCH    the config says list/object/text but the data holds something else
    BLOCKS SAVE      a required field whose current value is empty (the editor would refuse to save)
    config.yml has a duplicate key or duplicate sibling field name

  Usage:  node scripts/cms-coverage.js
          node scripts/cms-coverage.js --data-dir <path to a _data folder>   (test against a copy)
          node scripts/cms-coverage.js --config <path to a config.yml>
*/
"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------- allowlists
// Data files that are deliberately NOT in the CMS (the office never edits them). Same list as
// $StudioOnlyFiles in Test-CmsConfig.ps1. Every entry needs a reason.
const ALLOW_FILES = [
  { file: "_data/frame.json", reason: "per-page layout switches; editing them could break a layout" },
  { file: "_data/v2images.json", reason: "image names and sizes written by the image pipeline" },
  { file: "_data/images.json", reason: "image names and sizes written by the image pipeline" },
  { file: "_data/banned.json", reason: "claims guard list read by the build" },
  { file: "_data/platform.json", reason: "build settings (site origin, sitemap exclusions, guard folders)" }
];

// Data keys inside a CMS-edited file that are deliberately studio-only and have no CMS field at
// all. Prefer a `widget: hidden` field in config.yml (it carries the key through a CMS save);
// use this list only when that is impossible. Entry shape:
//   { file: "_data/x.json", path: "some.key" or "items[].key", reason: "why the office never sees it" }
// A path also covers everything under it (path.child and path[]). Empty on purpose today.
const ALLOW_KEYS = [];

// ---------------------------------------------------------------- arguments
function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const REPO_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.resolve(argValue("--config") || path.join(REPO_ROOT, "admin", "config.yml"));
const DATA_DIR = path.resolve(argValue("--data-dir") || path.join(REPO_ROOT, "_data"));

// ---------------------------------------------------------------- YAML subset reader
const YDUP = [];
let LINES = [];
let POS = 0;
let ANCHORS = new Map();

const mkMap = () => ({ kind: "map", map: new Map() });
const mkSeq = () => ({ kind: "seq", items: [] });
const mkSc = (value) => ({ kind: "sc", value });
const scalar = (n) => (n && n.kind === "sc" ? n.value : null);
const child = (n, k) => (n && n.kind === "map" && n.map.has(k) ? n.map.get(k) : null);

function removeComment(line) {
  if (line.indexOf("#") < 0) return line;
  let inD = false;
  let inS = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inD) { if (c === "\\") i++; else if (c === '"') inD = false; continue; }
    if (inS) { if (c === "'") inS = false; continue; }
    if (c === '"') { inD = true; continue; }
    if (c === "'") { inS = true; continue; }
    if (c === "#" && (i === 0 || line[i - 1] === " ")) return line.slice(0, i).replace(/\s+$/, "");
  }
  return line;
}

function unDouble(s) {
  if (s.indexOf("\\") < 0) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      const n = s[++i];
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === '"') out += '"';
      else if (n === "\\") out += "\\";
      else if (n === "/") out += "/";
      else out += "\\" + n;
    } else out += c;
  }
  return out;
}

function plainScalar(t) {
  const x = t.trim();
  if (x.length >= 2 && x[0] === '"' && x[x.length - 1] === '"') return unDouble(x.slice(1, -1));
  if (x.length >= 2 && x[0] === "'" && x[x.length - 1] === "'") return x.slice(1, -1).replace(/''/g, "'");
  return x;
}

const reWs = /\s*/y;
const reDq = /"((?:[^"\\]|\\.)*)"/y;
const reSq = /'((?:[^']|'')*)'/y;
const reKey = /(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^:,{}\[\]]+?))\s*:/y;
const rePlain = /[^,}\]]*/y;
const reKeyLine = /^([A-Za-z0-9_\-.]+):(?:\s+(.*))?$/;

function sticky(re, st) { re.lastIndex = st.i; return re.exec(st.s); }
function skipWs(st) { const m = sticky(reWs, st); if (m) st.i += m[0].length; }

function readFlowNode(st) {
  skipWs(st);
  if (st.i >= st.s.length) throw new Error("flow value ends early: " + st.s);
  const c = st.s[st.i];
  if (c === "{") {
    st.i++;
    const map = mkMap();
    for (;;) {
      skipWs(st);
      if (st.i >= st.s.length) throw new Error("unterminated { in: " + st.s);
      if (st.s[st.i] === "}") { st.i++; break; }
      const km = sticky(reKey, st);
      if (!km) throw new Error("bad flow key at " + st.i + " in: " + st.s);
      let key;
      if (km[1] !== undefined) key = unDouble(km[1]);
      else if (km[2] !== undefined) key = km[2].replace(/''/g, "'");
      else key = km[3].trim();
      st.i += km[0].length;
      const val = readFlowNode(st);
      if (map.map.has(key)) YDUP.push("duplicate key " + key + " in flow mapping: " + st.s.slice(0, 80));
      map.map.set(key, val);
      skipWs(st);
      if (st.i < st.s.length && st.s[st.i] === ",") st.i++;
    }
    return map;
  }
  if (c === "[") {
    st.i++;
    const seq = mkSeq();
    for (;;) {
      skipWs(st);
      if (st.i >= st.s.length) throw new Error("unterminated [ in: " + st.s);
      if (st.s[st.i] === "]") { st.i++; break; }
      seq.items.push(readFlowNode(st));
      skipWs(st);
      if (st.i < st.s.length && st.s[st.i] === ",") st.i++;
    }
    return seq;
  }
  if (c === '"') {
    const m = sticky(reDq, st);
    if (!m) throw new Error("bad double quote in: " + st.s);
    st.i += m[0].length;
    return mkSc(unDouble(m[1]));
  }
  if (c === "'") {
    const m = sticky(reSq, st);
    if (!m) throw new Error("bad single quote in: " + st.s);
    st.i += m[0].length;
    return mkSc(m[1].replace(/''/g, "'"));
  }
  if (c === "*") {
    const m = sticky(rePlain, st);
    st.i += m[0].length;
    const nm = m[0].slice(1).trim();
    if (!ANCHORS.has(nm)) throw new Error("unknown alias *" + nm);
    return ANCHORS.get(nm);
  }
  const m = sticky(rePlain, st);
  st.i += m[0].length;
  return mkSc(m[0].trim());
}

const isDash = (t) => t === "-" || t.startsWith("- ");

function readBlock() {
  if (POS >= LINES.length) return mkSc(null);
  const ln = LINES[POS];
  return isDash(ln.text) ? readSeq(ln.indent) : readMap(ln.indent);
}

function readValue(rest, parentIndent) {
  if (rest.length === 0) {
    if (POS < LINES.length) {
      const nx = LINES[POS];
      if (nx.indent > parentIndent) return readBlock();
      if (nx.indent === parentIndent && isDash(nx.text)) return readSeq(parentIndent);
    }
    return mkSc(null);
  }
  const c = rest[0];
  if (c === "&") {
    const m = /^&(\S+)\s*(.*)$/.exec(rest);
    const val = readValue(m[2], parentIndent);
    ANCHORS.set(m[1], val);
    return val;
  }
  if (c === "*") {
    const nm = rest.slice(1).trim();
    if (!ANCHORS.has(nm)) throw new Error("unknown alias *" + nm);
    return ANCHORS.get(nm);
  }
  if (c === "{" || c === "[") return readFlowNode({ s: rest, i: 0 });
  if (/^[|>][-+]?$/.test(rest)) {
    const parts = [];
    while (POS < LINES.length && LINES[POS].indent > parentIndent) { parts.push(LINES[POS].text); POS++; }
    return mkSc(parts.join(" "));
  }
  return mkSc(plainScalar(rest));
}

function readMap(indent) {
  const map = mkMap();
  while (POS < LINES.length) {
    const ln = LINES[POS];
    if (ln.indent !== indent) break;
    if (isDash(ln.text)) break;
    const m = reKeyLine.exec(ln.text);
    if (!m) throw new Error("YAML line " + ln.line + ": cannot read a key from: " + ln.text);
    POS++;
    const rest = m[2] !== undefined ? m[2].trim() : "";
    if (map.map.has(m[1])) YDUP.push("YAML line " + ln.line + ": duplicate key " + m[1]);
    map.map.set(m[1], readValue(rest, indent));
  }
  return map;
}

function readSeq(indent) {
  const seq = mkSeq();
  while (POS < LINES.length) {
    const ln = LINES[POS];
    if (ln.indent !== indent) break;
    if (!isDash(ln.text)) break;
    const rest = ln.text.length > 1 ? ln.text.slice(1).replace(/^\s+/, "") : "";
    const contentIndent = indent + (ln.text.length - rest.length);
    if (rest.length === 0) {
      POS++;
      seq.items.push(readValue("", indent));
      continue;
    }
    const c = rest[0];
    if (c !== "{" && c !== "[" && c !== '"' && c !== "'" && c !== "&" && c !== "*" && reKeyLine.test(rest)) {
      LINES[POS] = { indent: contentIndent, text: rest, line: ln.line };
      seq.items.push(readMap(contentIndent));
      continue;
    }
    POS++;
    seq.items.push(readValue(rest, indent));
  }
  return seq;
}

function importYaml(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const lines = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    if (raw.trim().length === 0) return;
    if (raw.trimStart().startsWith("#")) return;
    const s = removeComment(raw);
    if (s.trim().length === 0) return;
    const indent = s.length - s.replace(/^ +/, "").length;
    lines.push({ indent, text: s.trim(), line: idx + 1 });
  });
  LINES = lines;
  POS = 0;
  ANCHORS = new Map();
  return readBlock();
}

// ---------------------------------------------------------------- config walker
const CFG = [];

function addFields(fields, prefix, ctx) {
  if (!fields || fields.kind !== "seq") return;
  const sib = new Set();
  fields.items.forEach((f) => {
    if (f.kind !== "map") return;
    const name = scalar(child(f, "name"));
    if (!name) throw new Error("a field without a name in " + ctx.file);
    const widget = scalar(child(f, "widget")) || "string";
    const p = prefix + name;
    if (sib.has(name)) YDUP.push("duplicate field name " + name + " under " + prefix + " in " + ctx.file);
    sib.add(name);
    const req = scalar(child(f, "required")) !== "false";
    let kind = "leaf";
    if (widget === "object") kind = "object";
    else if (widget === "list") kind = "list";
    else if (widget === "hidden") kind = "hidden";
    else if (scalar(child(f, "multiple")) === "true") kind = "multi";
    const rec = (over) => Object.assign({ collection: ctx.collection, file: ctx.file, path: p, kind, widget, required: req, readonly: scalar(child(f, "readonly")) === "true" }, over);
    CFG.push(rec({}));
    if (kind === "multi") CFG.push(rec({ path: p + "[]", kind: "leaf", readonly: false }));
    if (widget === "object") {
      addFields(child(f, "fields"), p + ".", ctx);
    } else if (widget === "list") {
      const single = child(f, "field");
      const multi = child(f, "fields");
      if (single && single.kind === "map") {
        const sw = scalar(child(single, "widget")) || "string";
        if (sw === "object") {
          CFG.push(rec({ path: p + "[]", kind: "item", widget: "object", required: true, readonly: false }));
          addFields(child(single, "fields"), p + "[].", ctx);
        } else {
          CFG.push(rec({ path: p + "[]", kind: "leaf", widget: sw, required: true, readonly: false }));
        }
      } else if (multi) {
        CFG.push(rec({ path: p + "[]", kind: "item", widget: "object", required: true, readonly: false }));
        addFields(multi, p + "[].", ctx);
      } else if (child(f, "types")) {
        throw new Error("list with types: at " + p + " in " + ctx.file + " is not supported by this reader; extend it");
      }
    }
  });
}

// ---------------------------------------------------------------- data walker
const RANK = { emptylist: 0, emptyobj: 0, leaf: 1, list: 2, object: 2 };
let EMPTIES = new Set();

function setPath(dict, p, kind) {
  if (!dict.has(p)) { dict.set(p, kind); return; }
  if (RANK[kind] > RANK[dict.get(p)]) dict.set(p, kind);
}

function addData(node, p, dict) {
  if (node === null || node === undefined) { setPath(dict, p, "leaf"); EMPTIES.add(p); return; }
  if (Array.isArray(node)) {
    setPath(dict, p, "list");
    const cp = p + "[]";
    if (node.length === 0) { setPath(dict, cp, "emptylist"); EMPTIES.add(p); return; }
    node.forEach((it) => addData(it, cp, dict));
    return;
  }
  if (typeof node === "object") {
    const keys = Object.keys(node);
    if (keys.length === 0) { setPath(dict, p, "emptyobj"); return; }
    if (p.length > 0) setPath(dict, p, "object");
    keys.forEach((k) => addData(node[k], p.length > 0 ? p + "." + k : k, dict));
    return;
  }
  if (typeof node === "string" && node.length === 0) EMPTIES.add(p);
  setPath(dict, p, "leaf");
}

function walkJson(dir, base, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(full, base, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".json")) out.push("_data/" + path.relative(base, full).split(path.sep).join("/"));
  });
}

const under = (dp, h) => dp === h || dp.startsWith(h + ".") || dp.startsWith(h + "[");

// ---------------------------------------------------------------- main
function main() {
  const cfg = importYaml(CONFIG_PATH);
  const collections = child(cfg, "collections");
  if (!collections || collections.kind !== "seq") throw new Error("config.yml has no collections list");
  collections.items.forEach((col) => {
    const colName = scalar(child(col, "name"));
    const files = child(col, "files");
    if (!files) return; // folder collection: no data file to compare
    files.items.forEach((file) => {
      const rel = scalar(child(file, "file")).replace(/\\/g, "/");
      addFields(child(file, "fields"), "", { collection: colName, file: rel });
    });
  });

  const byFile = new Map();
  CFG.forEach((r) => { if (!byFile.has(r.file)) byFile.set(r.file, []); byFile.get(r.file).push(r); });

  const dataFiles = [];
  walkJson(DATA_DIR, DATA_DIR, dataFiles);

  const orphCfg = [], orphData = [], unmapped = [], typeBad = [], blocks = new Set(), allowed = [];
  let unverified = 0, optional = 0, comparedFiles = 0, hiddenCovered = 0;
  const allowFile = new Map(ALLOW_FILES.map((a) => [a.file, a.reason]));

  dataFiles.sort().forEach((df) => {
    if (!byFile.has(df) && !allowFile.has(df)) unmapped.push(df + " (no CMS collection and not on the studio-only allowlist)");
  });

  Array.from(byFile.keys()).sort().forEach((cf) => {
    const full = path.join(DATA_DIR, cf.replace(/^_data\//, "").split("/").join(path.sep));
    if (!fs.existsSync(full)) { orphCfg.push(cf + " :: FILE MISSING (the CMS points at a data file that does not exist)"); return; }
    comparedFiles++;
    const data = JSON.parse(fs.readFileSync(full, "utf8").replace(/^﻿/, ""));
    const D = new Map();
    EMPTIES = new Set();
    addData(data, "", D);
    const recs = byFile.get(cf);
    const emptyMarkers = Array.from(D.keys()).filter((k) => D.get(k) === "emptylist" || D.get(k) === "emptyobj");

    // config -> data
    const seen = new Set();
    recs.forEach((r) => {
      if (seen.has(r.path)) return;
      seen.add(r.path);
      const p = r.path;
      if (D.has(p)) {
        const dk = D.get(p);
        let bad = false;
        if (r.kind === "object") bad = dk !== "object" && dk !== "emptyobj";
        else if (r.kind === "list" || r.kind === "multi") bad = dk !== "list";
        else if (r.kind === "item") bad = dk !== "object" && dk !== "emptyobj" && dk !== "emptylist";
        else if (r.kind === "leaf") {
          if (dk === "emptylist") { unverified++; return; }
          bad = dk !== "leaf";
        }
        if (bad) typeBad.push(cf + " :: " + p + "  config=" + r.widget + " data=" + dk);
        return;
      }
      if (emptyMarkers.some((m) => p === m || p.startsWith(m + ".") || p.startsWith(m + "["))) { unverified++; return; }
      if (r.kind !== "hidden" && r.required === false) { optional++; return; }
      orphCfg.push(cf + " :: " + p + "  [collection " + r.collection + ", " + r.widget + "]");
    });

    // a required field whose current value is empty blocks the whole save in the editor
    recs.forEach((r) => {
      if (r.kind === "hidden" || r.kind === "item" || r.kind === "object" || r.readonly || r.widget === "boolean") return;
      if (r.required && EMPTIES.has(r.path)) blocks.add(cf + " :: " + r.path + "  [collection " + r.collection + ", " + r.widget + "]");
    });

    // data -> config, once per collection that edits this file (a save from a collection that
    // does not list a key may drop it)
    Array.from(new Set(recs.map((r) => r.collection))).sort().forEach((colName) => {
      const Cc = new Map();
      const hidden = [];
      recs.forEach((r) => {
        if (r.collection !== colName) return;
        if (!Cc.has(r.path)) Cc.set(r.path, r);
        if (r.kind === "hidden") hidden.push(r.path);
      });
      Array.from(D.keys()).sort().forEach((dp) => {
        const dk = D.get(dp);
        if (dk === "object" || dk === "list" || dp === "") return;
        if (Cc.has(dp)) return;
        if (hidden.some((h) => under(dp, h))) { hiddenCovered++; return; }
        if (dk === "emptylist" && Cc.has(dp.slice(0, -2))) return;
        const al = ALLOW_KEYS.find((a) => a.file === cf && under(dp, a.path));
        if (al) { allowed.push(cf + " :: " + dp + "  (allowlisted: " + al.reason + ")"); return; }
        orphData.push(cf + " :: " + dp + "  (data key not covered by collection " + colName + ")");
      });
    });
  });

  const dups = YDUP.slice();

  // ------------------------------------------------------------ report
  const section = (title, rows) => {
    console.log(title + ": " + rows.length);
    rows.forEach((x) => console.log("  " + x));
  };
  console.log("cms-coverage: config " + path.relative(process.cwd(), CONFIG_PATH) + ", data " + path.relative(process.cwd(), DATA_DIR) +
    "; " + collections.items.length + " collections, " + byFile.size + " file entries, " + CFG.length + " field records");
  console.log("Compared " + comparedFiles + " data files (" + hiddenCovered + " data keys sit under hidden studio-only fields; " +
    allowed.length + " under the key allowlist; " + ALLOW_FILES.length + " studio-only files allowlisted).");
  section("ORPHAN (config field, no data key)", orphCfg);
  section("ORPHAN (data key, no config field)", orphData);
  section("UNMAPPED FILE", unmapped);
  section("TYPE MISMATCH", typeBad);
  section("BLOCKS SAVE (field is required but its current value is empty; add required: false)", Array.from(blocks).sort());
  section("DUPLICATE KEY or FIELD NAME in config.yml", dups);
  if (allowed.length) section("ALLOWLISTED data keys (informational)", allowed);
  console.log("UNVERIFIED (data list empty today): " + unverified + "; optional fields absent from data: " + optional);
  const bad = orphCfg.length + orphData.length + unmapped.length + typeBad.length + blocks.size + dups.length;
  console.log("SUMMARY: config-orphans=" + orphCfg.length + " data-orphans=" + orphData.length + " unmapped-files=" + unmapped.length +
    " type-mismatch=" + typeBad.length + " blocks-save=" + blocks.size + " duplicates=" + dups.length);
  if (bad > 0) {
    console.log("RESULT: FAIL (the office CMS does not cover the data; add the field to admin/config.yml, or allowlist the key in scripts/cms-coverage.js with a reason)");
    process.exit(1);
  }
  console.log("RESULT: PASS (0 orphans either way)");
}

try {
  main();
} catch (e) {
  console.error("cms-coverage: could not run: " + (e && e.message ? e.message : e));
  process.exit(1);
}
