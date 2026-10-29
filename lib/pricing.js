// Price gate for templates. One rule, used by every page that prints a price.
//
// PRODUCTION (the public site): a price shows only when
//   status === "confirmed" && publish === true && legal_hold !== true.
// PREVIEW (deploy previews, branch deploys, or BC_PRICE_MODE=preview): also shows
//   status "draft" and confirmed-but-unpublished prices, flagged draft: true so the template
//   prints a small "Draft price" tag. legal_hold entries NEVER show, in any mode.
// Everything else returns the fallback "Call for a quote".
//
// assets/v2/builder.js applies the same rule in the browser (data-price-mode on [data-bt]).
// Keep the two in step.

const FALLBACK = "Call for a quote";
const PREVIEW_CONTEXTS = ["deploy-preview", "branch-deploy"];

// "preview" or "production", read once at build time.
function priceMode(env) {
  const e = env || process.env;
  if (String(e.BC_PRICE_MODE || "").toLowerCase() === "preview") return "preview";
  if (PREVIEW_CONTEXTS.indexOf(String(e.CONTEXT || "")) > -1) return "preview";
  return "production";
}

function hasAmount(entry) {
  return typeof entry.amount === "number" && isFinite(entry.amount) && entry.amount > 0;
}

function displayOf(entry) {
  return entry.display ? String(entry.display) : "From $" + entry.amount;
}

// priceFor(entry, mode) -> { show, display, draft }
function priceFor(entry, mode) {
  const hidden = { show: false, display: FALLBACK, draft: false };
  if (!entry || typeof entry !== "object" || entry.legal_hold === true || !hasAmount(entry)) return hidden;
  if (entry.status === "confirmed" && entry.publish === true) {
    return { show: true, display: displayOf(entry), draft: false };
  }
  if (mode === "preview" && (entry.status === "draft" || entry.status === "confirmed")) {
    return { show: true, display: displayOf(entry), draft: true };
  }
  return hidden;
}

// quoteFor(pricing, classId, panelKeys, mode) -> { show, display, draft }
// Covers the picked panels exactly with packages (auto_tint.coverage) and separate lines
// (auto_tint.panels) that pass priceFor, using the fewest pieces. If any panel cannot be
// covered, returns the fallback; never a partial total. Mirrors builder.js.
function quoteFor(pricing, classId, panelKeys, mode) {
  const hidden = { show: false, display: FALLBACK, draft: false };
  const keys = (panelKeys || []).slice();
  if (!keys.length) return hidden;
  const at = (pricing && pricing.auto_tint) || {};
  const pieces = [];
  Object.keys(at.coverage || {}).forEach((k) => {
    const c = at.coverage[k];
    pieces.push({ keys: c.panels || [], entry: c[classId] });
  });
  Object.keys(at.panels || {}).forEach((k) => {
    pieces.push({ keys: [k], entry: at.panels[k][classId] });
  });
  const usable = pieces
    .map((p) => ({ keys: p.keys, entry: p.entry, gate: priceFor(p.entry, mode) }))
    .filter((p) => p.gate.show && p.keys.length);
  function solve(rem) {
    if (!rem.length) return [];
    let best = null;
    usable.forEach((pc) => {
      if (pc.keys.indexOf(rem[0]) < 0) return;
      if (!pc.keys.every((k) => rem.indexOf(k) > -1)) return;
      const rest = solve(rem.filter((k) => pc.keys.indexOf(k) < 0));
      if (rest && (!best || rest.length + 1 < best.length)) best = [pc].concat(rest);
    });
    return best;
  }
  const parts = solve(keys);
  if (!parts) return hidden;
  const draft = parts.some((p) => p.gate.draft);
  if (parts.length === 1) return { show: true, display: parts[0].gate.display, draft };
  const sum = parts.reduce((n, p) => n + p.entry.amount, 0);
  return { show: true, display: "From $" + sum, draft };
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

module.exports = { priceMode, priceFor, quoteFor, anyAutoPrice, FALLBACK };
