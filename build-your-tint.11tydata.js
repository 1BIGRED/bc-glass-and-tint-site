// Data for /build-your-tint (overhaul v3, WS4; blueprint 4.5, art direction 3.6, engineering 3.2.3).
// Wording: _data/pages/build_your_tint.json. Prices and presets: _data/pricing.json, only through
// lib/pricing.js (the gate). Code: lib/buildcode.js. Behavior: assets/v3/js/builder/50-builder.js.
//
// What this file builds:
//   bt_config   the ONE object the browser reads (script[data-bt-config]). Every price, preset and
//               add-on in it has passed the gate for this build's mode, so a production page never
//               carries a draft number, a draft preset or a "status":"draft" string. Front-door
//               shades darker than the legal line are never in it (they are not rendered at all).
//   bt_bodies   the four fine-line side profiles (geometry only; drawn facing left, floor y=290)
//   bt_noscript the no-JS rules table
//   schema_ld   Breadcrumb, the one business node (#business), WebSite, WebPage
//
// builderConfig(pricing, pg, mode) is exported for tests\pricing.test.js.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const P = require("./lib/pricing");

const MODE = P.priceMode(process.env);
const WINDOWS = ["front", "rear", "back"];

// Vehicle side profiles (kept from the v2 builder geometry, same owner). Each body: outline, the
// glass paths per window group, wheel centers and radius, door seams.
const BODIES = [
  {
    id: "car",
    body: "M96 262C80 262 72 254 70 242L68 226C68 214 74 206 88 202C140 192 200 186 262 182C300 160 330 138 356 126C400 112 460 108 498 112C534 118 566 140 600 166C640 170 680 172 708 176C722 178 730 188 732 200L734 236C734 250 726 260 712 262L650 262A46 46 0 1 0 560 262L235 262A46 46 0 1 0 145 262Z",
    glass: {
      front: "M286 184C312 164 338 144 364 134C384 128 404 124 428 123L428 182Z",
      rear: "M440 123L482 123C504 128 524 144 542 162L546 180L440 182Z",
      back: "M542 134C562 143 580 153 598 166L586 169C568 158 550 148 534 141Z"
    },
    wheels: [[190, 252], [605, 252]],
    r: 38,
    seams: ["M268 196C266 216 266 238 268 258", "M434 186L434 262", "M552 182C552 196 552 208 550 214"]
  },
  {
    id: "suv",
    body: "M98 258C80 258 72 250 70 236L68 200C68 184 76 174 92 170C150 162 210 156 268 154C296 124 318 92 340 76C356 68 390 66 428 66L646 66C672 66 690 72 700 86C712 118 722 150 728 180L732 232C732 248 724 256 710 258L657 258A48 48 0 1 0 563 258L247 258A48 48 0 1 0 153 258Z",
    glass: {
      front: "M290 154C306 128 326 98 348 82L448 80L448 152Z",
      rear: "M460 80L560 80L560 150L460 151ZM572 80L664 80C676 80 684 86 688 96L696 148L572 150Z",
      back: "M704 94C711 116 717 136 721 158L712 158C709 138 704 118 697 98Z"
    },
    wheels: [[200, 250], [610, 250]],
    r: 40,
    seams: ["M274 162C272 190 272 226 274 256", "M454 156L454 258", "M566 152L566 212"]
  },
  {
    id: "pickup",
    body: "M96 258C80 258 70 250 68 236L66 186C66 172 74 164 90 162C150 154 210 150 264 148C290 120 310 90 330 76C340 70 354 68 370 68L470 68C480 68 486 74 488 82L492 156L740 156C746 156 750 160 750 166L752 236C752 250 744 258 730 258L673 258A48 48 0 1 0 579 258L243 258A48 48 0 1 0 149 258Z",
    glass: {
      front: "M284 150C300 124 316 96 336 82L392 80L392 146Z",
      rear: "M404 80L466 80C471 80 474 84 474 89L476 144L404 146Z",
      back: "M478 82C484 83 487 87 487 92L489 140L480 141Z"
    },
    wheels: [[196, 250], [626, 250]],
    r: 40,
    seams: ["M270 158C268 186 268 226 270 256", "M398 150L398 258", "M482 156L482 230", "M494 166L744 166"]
  },
  {
    id: "van",
    body: "M96 262C80 262 70 254 68 240L66 220C66 206 74 196 90 192C130 186 170 180 206 172C250 140 296 104 340 90C360 84 390 82 420 82L676 84C700 84 716 92 722 106C730 140 734 176 736 206L736 240C736 254 728 262 714 262L661 262A46 46 0 1 0 571 262L235 262A46 46 0 1 0 145 262Z",
    glass: {
      front: "M236 178C270 148 304 120 344 102L384 97L384 170Z",
      rear: "M396 97L540 97L540 166L396 168ZM552 97L664 97C680 97 692 104 698 116L706 164L552 166Z",
      back: "M719 112C724 132 728 150 730 170L721 170C719 150 715 132 711 114Z"
    },
    wheels: [[190, 252], [616, 252]],
    r: 38,
    seams: ["M222 182C220 206 220 236 222 258", "M390 172L390 262", "M546 168L546 262"]
  }
];

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
  return { auto_tint: out };
}

function builderConfig(pricing, pg, mode) {
  const pr = pricing || {};
  const W = pg.windows;
  const shades = {};
  WINDOWS.forEach((w) => {
    shades[w] = P.shadesFor(pr, w).map((s) => ({
      v: s.vlt,
      a: s.alpha,
      // Words only, unless the owner confirmed this shade (CEO ruling 2026-10-29).
      name: s.confirmed ? s.vlt + "%" : (W.words[String(s.vlt)] || W.word_fallback),
      num: s.confirmed
    }));
  });
  const confirmed = shades.rear.filter((s) => s.num).map((s) => s.v);
  const keyToWin = {};
  WINDOWS.forEach((w) => { keyToWin[W.panels[w].key] = w; });
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
    const order = WINDOWS.map((w) => W.panels[w].key).filter((k) => Object.keys(p.panels).indexOf(k) > -1);
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
    windows: WINDOWS.map((w) => ({ id: w, key: W.panels[w].key, label: W.panels[w].label, legal: W.panels[w].legal })),
    shades,
    // Peak R1 (visual 4): columns per fine-tune row = the longest row (No film plus its shades), so
    // a shade sits in the same column on every row.
    scale_cols: Math.max.apply(null, WINDOWS.map((w) => shades[w].length + 1)),
    confirmed,
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
      live_total: pg.live.total,
      ask_price: pg.result.ask_price
    }
  };
}

module.exports = {
  builderConfig,
  eleventyComputed: {
    bt_mode: () => MODE,
    bt_bodies: () => BODIES,
    bt_body_ids: () => { const o = {}; BODIES.forEach((b) => { o[b.id] = b; }); return o; },
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
      return WINDOWS.map((w) => ({ label: W.panels[w].label, legal: W.panels[w].legal })).concat([{ label: "Windshield", legal: W.strip_legal }]);
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
