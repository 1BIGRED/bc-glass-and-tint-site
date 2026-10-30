// Critical CSS, peak pass R2 part A (technical 1, 2026-10-30). Not an Eleventy plugin (the name does
// not start with "eleventy-"); .eleventy.js calls it from its HTML transform.
//
// What it does. For one built page it keeps every CSS rule of the page's stylesheets that COULD match
// an element of that page, and drops the rest. The kept rules are inlined in a <style> in the head,
// so the first paint needs no stylesheet request; the full stylesheets then load without blocking
// (media="print" swapped to "all" by a tiny inline script, a <noscript> link for no-JS visitors).
// This is the "keep every rule that matches an element on the page" method (not a fold-only cut),
// so no breakpoint and no part of the page can lose a rule it needs at first paint.
//
// "Could match" is decided without a browser, conservatively (when in doubt, keep):
//   - every class, id, tag and attribute NAME in a selector must occur somewhere in the page's HTML,
//     or be one the page scripts set (classList.add/toggle/remove and setAttribute literals found in
//     the core JS, passed in as `extraTokens`), or be one the head script sets before first paint
//     (html.js, html[data-ck]);
//   - the inside of :not(), :is(), :where(), :has() and the other functional pseudo-classes is
//     ignored (that only ever keeps more);
//   - a selector that needs :hover, :active, :focus, :focus-visible, :focus-within or :visited at
//     the top level is dropped: nothing is hovered or focused at first paint, and the full sheet
//     arrives long before any interaction;
//   - @font-face, @keyframes and @property blocks are always kept; @media print is dropped.
// The full stylesheets stay byte for byte as they were; they load right after and win any tie
// because they come later in the cascade with the same rules.

"use strict";

const ALWAYS_TAGS = new Set(["html", "body", "head"]);
const INTERACTIVE = /:(hover|active|focus|focus-visible|focus-within|visited)(?![\w-])/;

// ---------------------------------------------------------------- tokens of a page
function htmlTokens(html) {
  const classes = new Set();
  const ids = new Set();
  const tags = new Set();
  const attrs = new Set();
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)(\s[^<>]*?)?\/?>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    tags.add(m[1].toLowerCase());
    const rest = m[2] || "";
    const attrRe = /([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let a;
    while ((a = attrRe.exec(rest))) {
      const name = a[1].toLowerCase();
      attrs.add(name);
      const val = a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : "";
      if (name === "class") val.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      else if (name === "id" && val) ids.add(val);
    }
  }
  return { classes, ids, tags, attrs };
}

// Class names and attribute names the page scripts can set, read from the JS source.
function scriptTokens(js) {
  const out = { classes: [], attrs: [] };
  if (!js) return out;
  const cl = /classList\.(?:add|toggle|remove)\(([^)]*)\)/g;
  let m;
  while ((m = cl.exec(js))) {
    const lits = m[1].match(/"([a-z][a-z0-9_-]*)"|'([a-z][a-z0-9_-]*)'/gi) || [];
    lits.forEach((l) => out.classes.push(l.slice(1, -1)));
  }
  const sa = /setAttribute\(\s*["']([a-z][a-z0-9-]*)["']/gi;
  while ((m = sa.exec(js))) out.attrs.push(m[1].toLowerCase());
  return out;
}

// ---------------------------------------------------------------- a small CSS block parser
// Returns a list of nodes: { type: "rule", sel, body } | { type: "at", name, prelude, body|null, children|null }
function parseBlock(css, start, end) {
  const nodes = [];
  let i = start;
  function skipWs() {
    for (;;) {
      while (i < end && /\s/.test(css[i])) i++;
      if (css[i] === "/" && css[i + 1] === "*") {
        const c = css.indexOf("*/", i + 2);
        i = c < 0 ? end : c + 2;
        continue;
      }
      break;
    }
  }
  // index of the matching close brace for the "{" at position open
  function matchBrace(open) {
    let depth = 0;
    for (let k = open; k < end; k++) {
      const ch = css[k];
      if (ch === "/" && css[k + 1] === "*") { const c = css.indexOf("*/", k + 2); k = c < 0 ? end : c + 1; continue; }
      if (ch === '"' || ch === "'") { k = skipString(k); continue; }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) return k; }
    }
    throw new Error("critical-css: unbalanced braces");
  }
  function skipString(k) {
    const q = css[k];
    for (k = k + 1; k < end; k++) {
      if (css[k] === "\\") { k++; continue; }
      if (css[k] === q) return k;
    }
    return end;
  }
  // the prelude runs to the first "{" or ";" outside strings, comments and parentheses
  function readPrelude() {
    let k = i, paren = 0;
    for (; k < end; k++) {
      const ch = css[k];
      if (ch === "/" && css[k + 1] === "*") { const c = css.indexOf("*/", k + 2); k = c < 0 ? end : c + 1; continue; }
      if (ch === '"' || ch === "'") { k = skipString(k); continue; }
      if (ch === "(") paren++;
      else if (ch === ")") paren--;
      else if (paren === 0 && (ch === "{" || ch === ";")) break;
    }
    return k;
  }
  for (;;) {
    skipWs();
    if (i >= end) break;
    const stop = readPrelude();
    const prelude = css.slice(i, stop).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (stop >= end || css[stop] === ";") {
      // a statement at-rule (@import, @charset) or stray text: keep at-rules as they are
      if (prelude.startsWith("@")) nodes.push({ type: "at", name: prelude.split(/[\s(]/)[0].slice(1).toLowerCase(), prelude, body: null, children: null, statement: true });
      i = stop + 1;
      continue;
    }
    const close = matchBrace(stop);
    if (prelude.startsWith("@")) {
      const name = prelude.split(/[\s({]/)[0].slice(1).toLowerCase();
      if (name === "media" || name === "supports" || name === "layer" || name === "container" || name === "document") {
        nodes.push({ type: "at", name, prelude, body: null, children: parseBlock(css, stop + 1, close) });
      } else {
        nodes.push({ type: "at", name, prelude, body: css.slice(stop + 1, close), children: null });
      }
    } else {
      nodes.push({ type: "rule", sel: prelude, body: css.slice(stop + 1, close) });
    }
    i = close + 1;
  }
  return nodes;
}

// split a selector list at top-level commas
function splitList(sel) {
  const out = [];
  let depth = 0, cur = "", q = null;
  for (let k = 0; k < sel.length; k++) {
    const ch = sel[k];
    if (q) { cur += ch; if (ch === "\\") { cur += sel[++k] || ""; } else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// remove functional pseudo-classes (and their arguments) from a selector, keeping everything else
function stripFunctional(sel) {
  let out = "";
  for (let k = 0; k < sel.length; k++) {
    if (sel[k] === ":" ) {
      const m = /^::?[a-zA-Z-]+\(/.exec(sel.slice(k));
      if (m) {
        let depth = 0, j = k + m[0].length - 1;
        for (; j < sel.length; j++) {
          if (sel[j] === "(") depth++;
          else if (sel[j] === ")") { depth--; if (depth === 0) break; }
        }
        k = j;
        continue;
      }
    }
    if (sel[k] === "[") {
      // keep attribute selectors whole (their values may hold ":" or "(")
      const j = sel.indexOf("]", k);
      out += sel.slice(k, j < 0 ? sel.length : j + 1);
      k = j < 0 ? sel.length : j;
      continue;
    }
    out += sel[k];
  }
  return out;
}

function unescapeIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (m, g) => (/^[0-9a-fA-F]/.test(g) && g.trim().length > 0 && /^[0-9a-fA-F]+$/.test(g.trim()) ? String.fromCodePoint(parseInt(g.trim(), 16)) : g));
}

function selectorMayMatch(sel, tok) {
  const base = stripFunctional(sel);
  if (INTERACTIVE.test(base)) return false;
  // attribute names
  const attrRe = /\[\s*([^\s~|^$*=\]]+)/g;
  let m;
  while ((m = attrRe.exec(base))) {
    if (!tok.attrs.has(m[1].toLowerCase())) return false;
  }
  const noAttr = base.replace(/\[[^\]]*\]/g, "");
  const clsRe = /\.((?:\\.|[\w-])+)/g;
  while ((m = clsRe.exec(noAttr))) {
    if (!tok.classes.has(unescapeIdent(m[1]))) return false;
  }
  const idRe = /#((?:\\.|[\w-])+)/g;
  while ((m = idRe.exec(noAttr))) {
    if (!tok.ids.has(unescapeIdent(m[1]))) return false;
  }
  // type selectors: an identifier at the start of a compound (after start, a space or a combinator)
  const cleaned = noAttr.replace(/::?[\w-]+/g, "").replace(/[.#](?:\\.|[\w-])+/g, "");
  const typeRe = /(^|[\s>+~])([a-zA-Z][\w-]*)/g;
  while ((m = typeRe.exec(cleaned))) {
    const t = m[2].toLowerCase();
    if (ALWAYS_TAGS.has(t)) continue;
    if (!tok.tags.has(t)) return false;
  }
  return true;
}

function emit(nodes, tok) {
  let out = "";
  nodes.forEach((n) => {
    if (n.type === "rule") {
      const keep = splitList(n.sel).filter((s) => selectorMayMatch(s, tok));
      if (keep.length) out += keep.join(",") + "{" + minifyBody(n.body) + "}";
      return;
    }
    if (n.statement) { out += n.prelude + ";"; return; }
    if (n.children) {
      if (n.name === "media" && /^@media\s+print\b/i.test(n.prelude)) return;
      const inner = emit(n.children, tok);
      if (inner) out += n.prelude.replace(/\s+/g, " ") + "{" + inner + "}";
      return;
    }
    // @font-face, @keyframes, @property, @page, @counter-style ...: kept whole
    if (n.name === "page") return;
    out += n.prelude.replace(/\s+/g, " ") + "{" + minifyBody(n.body) + "}";
  });
  return out;
}

// collapse whitespace and comments inside a declaration block (strings left alone)
function minifyBody(body) {
  let out = "", q = null;
  for (let k = 0; k < body.length; k++) {
    const ch = body[k];
    if (q) { out += ch; if (ch === "\\") out += body[++k] || ""; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
    if (ch === "/" && body[k + 1] === "*") { const c = body.indexOf("*/", k + 2); k = c < 0 ? body.length : c + 1; continue; }
    if (/\s/.test(ch)) { if (out && !/[\s:;,{(]$/.test(out)) out += " "; continue; }
    if ((ch === ";" || ch === ":" || ch === "," || ch === ")") && out.endsWith(" ")) out = out.slice(0, -1);
    out += ch;
  }
  return out.trim().replace(/;$/, "");
}

// critical(cssTexts, html, opts) -> the kept CSS as one minified string
function critical(cssTexts, html, opts) {
  const o = opts || {};
  const tok = htmlTokens(html);
  (o.extraClasses || []).forEach((c) => tok.classes.add(c));
  (o.extraAttrs || []).forEach((a) => tok.attrs.add(String(a).toLowerCase()));
  let out = "";
  cssTexts.forEach((css) => { out += emit(parseBlock(css, 0, css.length), tok); });
  return out;
}

module.exports = { critical, scriptTokens, htmlTokens, selectorMayMatch, parseBlock, splitList };
