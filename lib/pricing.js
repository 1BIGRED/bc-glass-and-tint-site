// Price gate for templates (WS4). One rule, used by every page that prints a price.
//
// PRODUCTION (the public site): a price shows only when
//   status === "confirmed" && publish === true && legal_hold !== true.
// PREVIEW (deploy previews, branch deploys, or BC_PRICE_MODE=preview): also shows
//   status "draft" and confirmed-but-unpublished prices, flagged draft: true so the template
//   prints a small "Draft price" tag. legal_hold entries NEVER show, in any mode.
// Everything else returns fallback words, never a number.
//
// The gate and the coverage solver live in ONE file shared with the browser:
//   assets/v3/js/builder/00-price-core.js (UMD; window.BCPrice in the builder bundle).
// This file adds the build-time pieces: the mode, presets, the fronts-versus-full arithmetic,
// add-ons, and the shade list (engineering 3.2.3).

const core = require("../assets/v3/js/builder/00-price-core.js");

const { FALLBACK, FALLBACKS, hasAmount, money, displayOf, priceFor, solveFor, quoteFor } = core;
// NRS 484D.440: front side windows at least 35 percent light through (area-profile.md, verified
// 2026-07-14). pricing.json front_min_vlt may only RAISE it, never lower it.
const LAW_FRONT_MIN_VLT = 35;
const SHADE_PANELS = ["front-doors", "rear-doors", "back-glass"];

// "preview" or "production", read once at build time. Aligned with WS1's lib/platform.js (one
// place decides the build kind): preview when BC_PRICE_MODE=preview, or when the platform build is
// noindex (BC_NOINDEX=1, or any Netlify CONTEXT other than "production": deploy-preview,
// branch-deploy, dev). Everything else, including a local build with no CONTEXT, is production, the
// safe default: only confirmed and published prices.
function priceMode(env) {
  const e = env || process.env;
  if (String(e.BC_PRICE_MODE || "").toLowerCase() === "preview") return "preview";
  let noindex;
  try {
    noindex = require("./platform").resolve(e).noindex;
  } catch (err) {
    const raw = String(e.CONTEXT || "").trim();
    noindex = String(e.BC_NOINDEX || "") === "1" || (raw !== "" && raw !== "production");
  }
  return noindex ? "preview" : "production";
}

function frontMin(pricing) {
  const v = pricing && Number(pricing.front_min_vlt);
  return isFinite(v) && v > LAW_FRONT_MIN_VLT ? v : LAW_FRONT_MIN_VLT;
}

// entryAt(pricing, "auto_tint.panels.windshield-strip") -> that object, or undefined
function entryAt(obj, path) {
  return String(path || "").split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

// The same gate as priceFor, for anything with status and publish (presets). legal_hold never shows.
function gateOf(item, mode) {
  if (!item || item.legal_hold === true) return { show: false, draft: false };
  if (item.status === "confirmed" && item.publish === true) return { show: true, draft: false };
  if (mode === "preview" && (item.status === "draft" || item.status === "confirmed")) return { show: true, draft: true };
  return { show: false, draft: false };
}

// A preset is valid only when every panel is a shade panel of auto_tint.panels and every shade is
// null (not named yet) or a whole number from 5 to 99, front doors at or above the legal line.
function presetValid(pricing, p) {
  if (!p || typeof p.id !== "string" || !p.id || !p.panels || typeof p.panels !== "object") return false;
  const keys = Object.keys(p.panels);
  if (!keys.length) return false;
  const known = ((pricing && pricing.auto_tint && pricing.auto_tint.panels) || {});
  const min = frontMin(pricing);
  return keys.every((k) => {
    if (SHADE_PANELS.indexOf(k) < 0 || !known[k]) return false;
    const v = p.panels[k];
    if (v === null) return true;
    if (typeof v !== "number" || Math.floor(v) !== v || v < 5 || v > 99) return false;
    if (k === "front-doors" && v < min) return false;
    return true;
  });
}

// presetFor(pricing, mode) -> the presets that pass the gate (draft: true on preview drafts)
function presetFor(pricing, mode) {
  return ((pricing && pricing.presets) || [])
    .filter((p) => presetValid(pricing, p))
    .map((p) => ({ p, g: gateOf(p, mode) }))
    .filter((x) => x.g.show)
    .map((x) => ({ id: x.p.id, label: x.p.label, description: x.p.description || "", panels: Object.assign({}, x.p.panels), draft: x.g.draft }));
}

// defaultPreset(pricing, mode) -> the default preset id, only when that preset passes; else null
function defaultPreset(pricing, mode) {
  const id = pricing && pricing.default_preset;
  if (!id) return null;
  return presetFor(pricing, mode).some((p) => p.id === id) ? id : null;
}

// fullVsParts(pricing, classId, mode) -> { front, rear, full, draft } only when all three coverage
// prices pass the gate AND front + rear === full; else null (the arithmetic line does not render).
function fullVsParts(pricing, classId, mode) {
  const cov = (pricing && pricing.auto_tint && pricing.auto_tint.coverage) || {};
  const f = cov.two_front_doors, r = cov.rear_doors_and_back_glass, a = cov.full_vehicle;
  if (!f || !r || !a) return null;
  const union = (f.panels || []).concat(r.panels || []).sort().join(",");
  if (union !== (a.panels || []).slice().sort().join(",")) return null;
  const ef = f[classId], er = r[classId], ea = a[classId];
  const gf = priceFor(ef, mode), gr = priceFor(er, mode), ga = priceFor(ea, mode);
  if (!gf.show || !gr.show || !ga.show) return null;
  if (ef.amount + er.amount !== ea.amount) return null;
  return {
    front: { amount: ef.amount, money: money(ef.amount), display: gf.display },
    rear: { amount: er.amount, money: money(er.amount), display: gr.display },
    full: { amount: ea.amount, money: money(ea.amount), display: ga.display },
    draft: gf.draft || gr.draft || ga.draft
  };
}

// addonFor(pricing, addon, classId, mode) -> { id, label, benefit, state, display, amount, draft, price_key }
//   state "priced": the price passes the gate; selectable and adds to the total
//   state "ask":    a number exists but cannot show here; an "Also ask about" toggle, price on the call
//   state "hidden": this class has no recorded number (for example a pickup sunroof)
function addonFor(pricing, addon, classId, mode) {
  const a = addon || {};
  const base = { id: a.id, label: a.label, benefit: a.benefit || "", state: "hidden", display: "", amount: null, draft: false, price_key: String(a.price_ref || "").split(".").pop() };
  const line = entryAt(pricing, a.price_ref);
  const entry = line && line[classId];
  if (!entry || entry.legal_hold === true) return base;
  const g = priceFor(entry, mode);
  if (g.show) return Object.assign(base, { state: "priced", display: g.display, amount: entry.amount, draft: g.draft });
  if (hasAmount(entry)) return Object.assign(base, { state: "ask" });
  return base;
}

function shadeAlpha(v) {
  return v ? Number((1 - Math.pow(v / 100, 1 / 2.2)).toFixed(4)) : 0;
}

// shadesFor(pricing, panel) -> [{ vlt, alpha, confirmed }] lightest first. The owner's stocked list
// (shades_installed: plain numbers, or { vlt, status: "confirmed" }) when it has values, every one
// confirmed; else the example shades, none confirmed. Front doors never get a shade below the line.
function shadesFor(pricing, panel) {
  const pr = pricing || {};
  const stocked = (Array.isArray(pr.shades_installed) ? pr.shades_installed : [])
    .map((s) => (typeof s === "number" ? s : s && s.status === "confirmed" ? Number(s.vlt) : NaN))
    .filter((v) => isFinite(v) && Math.floor(v) === v && v >= 5 && v <= 99);
  const confirmed = stocked.length > 0;
  const values = confirmed ? stocked : ((pr.example_shades && pr.example_shades.values) || []);
  const min = frontMin(pr);
  const uniq = [];
  values.forEach((v) => { if (uniq.indexOf(v) < 0) uniq.push(v); });
  return uniq
    .filter((v) => (panel === "front" || panel === "front-doors" ? v >= min : true))
    .sort((x, y) => y - x)
    .map((v) => ({ vlt: v, alpha: shadeAlpha(v), confirmed }));
}

// True when at least one auto tint price can show in this mode. Templates use it to pick the
// Build Your Tint heading ("See the price." only when a price can actually appear).
function anyAutoPrice(pricing, mode) {
  const at = (pricing && pricing.auto_tint) || {};
  const groups = [at.coverage || {}, at.panels || {}];
  return groups.some((g) =>
    Object.keys(g).some((k) => Object.keys(g[k]).some((c) => priceFor(g[k][c], mode).show))
  );
}

module.exports = {
  FALLBACK,
  FALLBACKS,
  LAW_FRONT_MIN_VLT,
  SHADE_PANELS,
  priceMode,
  hasAmount,
  money,
  displayOf,
  priceFor,
  solveFor,
  quoteFor,
  anyAutoPrice,
  entryAt,
  gateOf,
  presetValid,
  presetFor,
  presetsFor: presetFor,
  defaultPreset,
  fullVsParts,
  addonFor,
  shadeAlpha,
  shadesFor,
  frontMin
};
