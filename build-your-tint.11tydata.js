// Data for /build-your-tint (overhaul v3, WS4; blueprint 4.5, art direction 3.6, engineering 3.2.3).
// Wording: _data/pages/build_your_tint.json. Prices and presets: _data/pricing.json, only through
// lib/pricing.js (the gate). Code: lib/buildcode.js. Behavior: assets/v3/js/builder/50-builder.js.
//
// What this file builds:
//   bt_config   the ONE object the browser reads (script[data-bt-config]). Every price, preset and
//               add-on in it has passed the gate for this build's mode, so a production page never
//               carries a draft number, a draft preset or a "status":"draft" string. Front doors
//               offer every shade (Chase 2026-10-31); the darker ones carry the dark note. The full
//               windshield is its own window ("windshield", shades from windshield_shades).
//   bt_stage_svg the drawn vehicles: four classes x Side, Front 3/4, Rear 3/4 (lib/car-art.js)
//   bt_bodies   per class the tile picture (side outline id, wheel centres, radius, viewBox)
//   bt_noscript the no-JS rules table
//   schema_ld   Breadcrumb, the one business node (#business), WebSite, WebPage
//
// builderConfig(pricing, pg, mode) is exported for tests\pricing.test.js.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const P = require("./lib/pricing");
const BCODE = require("./lib/buildcode");

const MODE = P.priceMode(process.env);
const WINDOWS = ["front", "rear", "back", "windshield"];

// ---------- The vehicle graphics (05-CAR-GRAPHIC-SPEC.md, "Technical line, lit glass") ----------
// Four generic everyday vehicles (sedan, SUV, crew-cab pickup, minivan), each in three views (Side,
// Front 3/4, Rear 3/4; view ids side, front, rear), drawn as inline SVG by lib/car-art.js from one
// simple 3D model per vehicle. Windows: front, rear, back and windshield (data-win), each its own
// clipped group with the true-VLT film (spec 5.0); the windshield top strip is data-addon="top-strip".
const ART = require("./lib/car-art");
const F = (n) => Math.round(n);
const VIEWS = ART.VIEWS;
const GRAPHICS = ART.buildGraphics();

// The stage SVG's inner markup: shared gradients, one cabin per vehicle per view, then one hidden
// <g class="bt-body"> per vehicle per view (car Side shown first). The data-bb box lets 50-builder.js
// frame each view in the stage's safe area (spec 3.3).
function stageSvg() {
  let defs = '<defs><linearGradient id="bt-bodygrad" x1="0" y1="0" x2="0" y2="1"><stop class="bt-st-hi" offset="0"/><stop class="bt-st-lo" offset="1"/></linearGradient>' +
    '<radialGradient id="bt-glare"><stop class="bt-st-glare" offset="0"/><stop class="bt-st-glare-edge" offset="1"/></radialGradient>' +
    '<radialGradient id="bt-shadowgrad"><stop class="bt-st-sh" offset="0"/><stop class="bt-st-sh0" offset="1"/></radialGradient>';
  GRAPHICS.forEach((g) => VIEWS.forEach((v) => { defs += g.views[v].cabin; }));
  defs += "</defs>";
  let bodies = "";
  GRAPHICS.forEach((g, gi) => VIEWS.forEach((v) => {
    const w = g.views[v];
    const b = w.bb;
    bodies += '<g class="bt-body" data-body="' + g.id + '" data-view="' + v + '" data-bb="' + b.x + " " + b.y + " " + b.w + " " + b.h + '"' + (gi === 0 && v === "side" ? "" : " hidden") + ">" + w.body + "</g>";
  }));
  return defs + bodies;
}
const STAGE_SVG = stageSvg();
// The safe-area frame for a box (spec 3.3): desktop 86 percent of width, 66 percent of height.
function frameOf(b, fx, fy) {
  const w = b.w / fx, h = b.h / fy;
  return F(b.x + b.w / 2 - w / 2) + " " + F(b.y + b.h / 2 - h / 2) + " " + F(w) + " " + F(h);
}
const BODIES = GRAPHICS.map((g) => {
  const s = g.views.side;
  return { id: g.id, wheels: s.wheels, r: s.r, tile: s.bb.x + " " + (s.bb.y - 6) + " " + s.bb.w + " " + (s.bb.h + 6) };
});

// The auto tint prices that pass the gate in this mode, and only the fields the browser reads.
// An entry that does not pass is left out entirely (no status, no number).
function gatedAutoTint(pricing, mode, labels) {
  const L = labels || {};
  const at = (pricing && pricing.auto_tint) || {};
  const classes = ((pricing && pricing.vehicle_classes) || []).map((c) => c.id);
  function slim(e) {
    const r = P.priceFor(e, mode);
    if (!r.show) return undefined;
    const o = { status: e.status, publish: e.publish === true, amount: e.amount, display: e.display || null };
    if (Array.isArray(e.range)) o.range = e.range.slice(0, 2);
    return o;
  }
  const out = { coverage: {}, panels: {} };
  Object.keys(at.coverage || {}).forEach((k) => {
    const c = at.coverage[k];
    const o = { label: L[k] || c.label, panels: (c.panels || []).slice() };
    classes.forEach((cl) => { const s = slim(c[cl]); if (s) o[cl] = s; });
    out.coverage[k] = o;
  });
  Object.keys(at.panels || {}).forEach((k) => {
    const o = { label: L[k] || at.panels[k].label };
    classes.forEach((cl) => { const s = slim(at.panels[k][cl]); if (s) o[cl] = s; });
    out.panels[k] = o;
  });
  // the full windshield (00-price-core.js reads it as the panel key "windshield"): one entry for
  // every class, or a per-class entry when the file carries one; gated per class like the rest
  const fw = at.full_windshield_film;
  if (fw && typeof fw === "object") {
    const o = { label: L.full_windshield_film || fw.label };
    classes.forEach((cl) => { const s = slim(fw[cl] && typeof fw[cl] === "object" ? fw[cl] : fw); if (s) o[cl] = s; });
    out.full_windshield_film = o;
  }
  return { auto_tint: out };
}

function builderConfig(pricing, pg, mode) {
  const pr = pricing || {};
  const W = pg.windows;
  const shades = {};
  // the full windshield row exists only while pricing.json lists its shades (windshield_shades)
  const wins = WINDOWS.filter((w) => w !== "windshield" || P.shadesFor(pr, w).length > 0);
  wins.forEach((w) => {
    shades[w] = P.shadesFor(pr, w).map((s) => ({
      v: s.vlt,
      a: s.alpha,
      // label: the shade's number, shown on every chip, row and summary. Chase's ruling, logged in
      // BC decisions-log.md 2026-10-30 ("Build Your Tint: illustrated car, shades rendered at true
      // VLT"): the numbers 70 to 5 percent VLT are shown in the builder, superseding the
      // 2026-10-29 words-only ruling. name stays the shade's word ("Medium shade") and num stays
      // "the owner confirmed the shop stocks it" (pricing.json shades_installed); while that list
      // is empty the scale carries the "Example shades; the shop confirms what it stocks" line.
      label: s.vlt + "%",
      name: s.confirmed ? s.vlt + "%" : (W.words[String(s.vlt)] || W.word_fallback),
      num: s.confirmed
    }));
  });
  const confirmed = shades.rear.filter((s) => s.num).map((s) => s.v);
  // every offered shade prints as a number in the summary (same 2026-10-30 ruling)
  const numbers = [];
  wins.forEach((w) => shades[w].forEach((s) => { if (numbers.indexOf(s.v) < 0) numbers.push(s.v); }));
  const keyToWin = {};
  wins.forEach((w) => { keyToWin[W.panels[w].key] = w; });
  const classes = (pr.vehicle_classes || []).map((c) => c.id);
  const presets = P.presetFor(pr, mode).map((p) => {
    const set = {};
    Object.keys(p.panels).forEach((k) => {
      const w = keyToWin[k];
      const v = p.panels[k];
      // A named shade the builder does not offer for that window becomes "pick a shade".
      set[w] = v != null && shades[w].some((s) => s.v === v) ? v : "x";
    });
    // FIXES-A item 2: the tile's own price per vehicle class, through the same gate as the total
    // (quoteFor). Only classes whose price passes are listed, so a production page carries no
    // draft number; draft is true only on preview builds. "any" is what the tile shows before a
    // vehicle is picked: the one price every priced class shares, else nothing.
    const order = wins.map((w) => W.panels[w].key).filter((k) => Object.keys(p.panels).indexOf(k) > -1);
    const prices = {};
    classes.forEach((cl) => {
      const q = P.quoteFor(pr, cl, order, mode);
      if (q.show) prices[cl] = { display: q.display, draft: q.draft === true };
    });
    const shown = Object.keys(prices).map((k) => prices[k]);
    const same = shown.length > 0 && shown.length === classes.length && shown.every((x) => x.display === shown[0].display);
    const any = same ? { display: shown[0].display, draft: shown.some((x) => x.draft) } : null;
    return { id: p.id, label: p.label, description: p.description, set, draft: p.draft, prices, any };
  });
  const addons = {};
  const fvp = {};
  classes.forEach((cl) => {
    addons[cl] = (pr.addons || []).map((a) => P.addonFor(pr, a, cl, mode)).filter((a) => a.state !== "hidden")
      .map((a) => ({ id: a.id, label: a.label, benefit: a.benefit, state: a.state, display: a.display, draft: a.draft, key: a.price_key }));
    fvp[cl] = P.fullVsParts(pr, cl, mode);
  });
  return {
    mode,
    front_min: P.frontMin(pr),
    classes: classes.map((id) => Object.assign({ id }, pg.vehicles[id] || { label: id })),
    // dark: the Nevada note (Chase 2026-10-31) for a pick under dark_below: front doors darker than
    // front_min, and every full windshield shade (peak 10-31 W3: 101, so 70, 50 and 45 all carry
    // it; the top strip is an add-on and never does). The windshield words come from the page data
    // when it has windows.panels.windshield.dark, else from the build code's own label (the same
    // line the summary and /book print), so the row, the result and the hand-off say one thing.
    windows: wins.map((w) => ({
      id: w, key: W.panels[w].key, label: W.panels[w].label, legal: W.panels[w].legal,
      dark: W.panels[w].dark || (w === "windshield" ? BCODE.LABELS.windshield_dark : ""),
      dark_below: w === "windshield" ? 101 : P.frontMin(pr)
    })),
    shades,
    // Peak R1 (visual 4): columns per fine-tune row = the longest row (No film plus its shades), so
    // a shade sits in the same column on every row.
    scale_cols: Math.max.apply(null, wins.map((w) => shades[w].length + 1)),
    confirmed,
    numbers,
    // the windshield top strip is drawn at the 5 percent film alpha (spec 5.8); the code carries no
    // shade for it, so no number is shown for it
    strip_a: P.shadeAlpha(5),
    words: W.words,
    presets,
    default_preset: P.defaultPreset(pr, mode),
    pricing: gatedAutoTint(pr, mode, pg.result.part_labels),
    addons,
    also_ask: (pr.also_ask || []).map((a) => ({ id: a.id, label: a.label, benefit: a.benefit || "" })),
    fvp,
    text: {
      empty: presets.length ? pg.result.empty_presets : pg.result.empty_windows,
      empty_vehicle: pg.result.empty_vehicle,
      fallback: pg.result.fallback,
      // The tag text exists only on preview builds; a production page never carries it.
      draft_tag: mode === "preview" ? pg.result.draft_tag : "",
      code_empty: pg.result.code_empty,
      fronts_vs_full: pg.result.fronts_vs_full,
      upgrade_heading: pg.result.upgrade_heading,
      upgrade_button: pg.result.upgrade_button,
      upgrade_button_price: pg.result.upgrade_button_price,
      unset: W.unset,
      no_film: W.no_film,
      strip_legal: W.strip_legal,
      strip_covered: W.strip_covered,
      live_total: pg.live.total,
      ask_price: pg.result.ask_price
    }
  };
}

module.exports = {
  builderConfig,
  stageSvg: () => STAGE_SVG,
  graphics: () => GRAPHICS,
  eleventyComputed: {
    bt_mode: () => MODE,
    bt_bodies: () => BODIES,
    bt_body_ids: () => { const o = {}; BODIES.forEach((b) => { o[b.id] = b; }); return o; },
    bt_stage_svg: () => STAGE_SVG,
    bt_stage_vb: () => frameOf(GRAPHICS[0].views.side.bb, 0.86, 0.66),
    bt_config: (data) => builderConfig(data.pricing, data.pages.build_your_tint, MODE),
    // Example builds beside the tool (blueprint 4.5): only those whose preset passes the gate, each
    // with its gated price for that vehicle class.
    bt_examples: (data) => {
      const pg = data.pages.build_your_tint;
      const presets = P.presetFor(data.pricing, MODE);
      const W = pg.windows.panels;
      return (pg.presets.examples || []).map((ex) => {
        const p = presets.find((x) => x.id === ex.preset);
        if (!p) return null;
        const keys = Object.keys(p.panels);
        const order = ["front", "rear", "back"].map((w) => W[w].key).filter((k) => keys.indexOf(k) > -1);
        const q = P.quoteFor(data.pricing, ex.vehicle, order, MODE);
        return { label: ex.label, vehicle: ex.vehicle, preset: ex.preset, price: { show: q.show, display: q.display, draft: q.draft } };
      }).filter(Boolean);
    },
    bt_has_price: (data) => P.anyAutoPrice(data.pricing, MODE),
    bt_noscript: (data) => {
      const W = data.pages.build_your_tint.windows;
      const rows = ["front", "rear", "back"].map((w) => ({ label: W.panels[w].label, legal: W.panels[w].legal + (W.panels[w].dark ? " " + W.panels[w].dark : "") }));
      rows.push({ label: W.strip_label, legal: W.strip_legal });
      if (P.shadesFor(data.pricing, "windshield").length) rows.push({ label: W.panels.windshield.label, legal: W.panels.windshield.legal });
      return rows;
    },
    schema_ld: (data) => {
      const pg = data.pages.build_your_tint;
      return S.graph([
        S.breadcrumbNode({ slug: data.slug, name: S.plain(fill(pg.hero.crumb)) }),
        S.businessNode(data.site),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: pg.schema.date_modified })
      ]);
    }
  }
};
