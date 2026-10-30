/* BC Glass & Tint v3, price core (WS4). ONE copy of the price gate and the coverage solver, shared
   by the build (lib/pricing.js requires this file) and the browser (builder bundle). UMD: in Node it
   is module.exports, in the browser it is window.BCPrice.

   The gate (engineering 3.2.3, blueprint 6.1, CEO ruling 2026-10-29):
     PRODUCTION shows a price only when status === "confirmed" && publish === true && no legal_hold.
     PREVIEW also shows status "draft" and confirmed-but-unpublished prices, flagged draft: true.
     legal_hold entries NEVER show, in any mode. Anything else returns the fallback words.
   Never type a price here. Numbers come only from _data/pricing.json. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BCPrice = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FALLBACK = "Call for a quote";
  // Blueprint 6.1 fallback words by context. Templates pick one; the lib default stays FALLBACK so
  // the v2 pages that still read it do not change.
  var FALLBACKS = {
    auto: "Price confirmed on the call",
    home: "Priced after a free in-home measure",
    crack: "Price after we see it",
    generic: FALLBACK
  };

  function hasAmount(entry) {
    return !!entry && typeof entry.amount === "number" && isFinite(entry.amount) && entry.amount > 0;
  }

  function money(n) {
    return "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // The words a shown price prints. "range": [low, high] gives "Typically $X to $Y" (engineering
  // 3.2.3); else the entry's own display text; else "From $amount".
  function displayOf(entry) {
    if (entry && Array.isArray(entry.range) && entry.range.length === 2 &&
        typeof entry.range[0] === "number" && typeof entry.range[1] === "number" &&
        entry.range[0] > 0 && entry.range[1] >= entry.range[0]) {
      return "Typically " + money(entry.range[0]) + " to " + money(entry.range[1]);
    }
    return entry && entry.display ? String(entry.display) : "From " + money(entry.amount);
  }

  // priceFor(entry, mode) -> { show, display, draft }
  function priceFor(entry, mode) {
    var hidden = { show: false, display: FALLBACK, draft: false };
    if (!entry || typeof entry !== "object" || entry.legal_hold === true || !hasAmount(entry)) return hidden;
    if (entry.status === "confirmed" && entry.publish === true) {
      return { show: true, display: displayOf(entry), draft: false };
    }
    if (mode === "preview" && (entry.status === "draft" || entry.status === "confirmed")) {
      return { show: true, display: displayOf(entry), draft: true };
    }
    return hidden;
  }

  // The pieces quoteFor can use: every coverage package and every single line, each with its gate.
  function pieces(pricing, classId, mode) {
    var at = (pricing && pricing.auto_tint) || {};
    var out = [];
    Object.keys(at.coverage || {}).forEach(function (k) {
      var c = at.coverage[k];
      out.push({ id: k, keys: (c.panels || []).slice(), label: c.label, entry: c[classId] });
    });
    Object.keys(at.panels || {}).forEach(function (k) {
      out.push({ id: k, keys: [k], label: at.panels[k].label, entry: at.panels[k][classId] });
    });
    return out
      .map(function (p) { p.gate = priceFor(p.entry, mode); return p; })
      .filter(function (p) { return p.gate.show && p.keys.length; });
  }

  // solveFor(pricing, classId, panelKeys, mode) -> null, or the fewest gated pieces that cover the
  // picked panels EXACTLY (no piece may cover a panel that was not picked).
  function solveFor(pricing, classId, panelKeys, mode) {
    var keys = (panelKeys || []).slice();
    if (!keys.length) return null;
    var usable = pieces(pricing, classId, mode);
    function solve(rem) {
      if (!rem.length) return [];
      var best = null;
      usable.forEach(function (pc) {
        if (pc.keys.indexOf(rem[0]) < 0) return;
        if (!pc.keys.every(function (k) { return rem.indexOf(k) > -1; })) return;
        var rest = solve(rem.filter(function (k) { return pc.keys.indexOf(k) < 0; }));
        if (rest && (!best || rest.length + 1 < best.length)) best = [pc].concat(rest);
      });
      return best;
    }
    return solve(keys);
  }

  // quoteFor(pricing, classId, panelKeys, mode) -> { show, display, draft, parts }
  // Never a partial total: if any picked panel cannot be priced, the fallback.
  function quoteFor(pricing, classId, panelKeys, mode) {
    var hidden = { show: false, display: FALLBACK, draft: false, parts: [] };
    var parts = solveFor(pricing, classId, panelKeys, mode);
    if (!parts) return hidden;
    var draft = parts.some(function (p) { return p.gate.draft; });
    var list = parts.map(function (p) { return { id: p.id, label: p.label, display: p.gate.display, amount: p.entry.amount, draft: p.gate.draft }; });
    if (parts.length === 1) return { show: true, display: parts[0].gate.display, draft: draft, parts: list };
    var sum = parts.reduce(function (n, p) { return n + p.entry.amount; }, 0);
    return { show: true, display: "From " + money(sum), draft: draft, parts: list };
  }

  return {
    FALLBACK: FALLBACK,
    FALLBACKS: FALLBACKS,
    hasAmount: hasAmount,
    money: money,
    displayOf: displayOf,
    priceFor: priceFor,
    solveFor: solveFor,
    quoteFor: quoteFor
  };
});
