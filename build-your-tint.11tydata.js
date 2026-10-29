// Data for build-your-tint.html ("The Showroom", CREATIVE-DIRECTION.md moments 2 and 3).
// Wording: _data/pages/build_your_tint.json. Prices: _data/pricing.json, only through
// lib/pricing.js (priceFor / quoteFor) and the same rule again in assets/v2/builder.js.
//
// What this file builds:
//   bt_shades      the shade chips (owner's stocked list when pricing.shades_installed has values,
//                  else example_shades, labelled as examples), each with its gamma-aware opacity
//   bt_init        the server-rendered first state (so the page is right before the script runs,
//                  with no layout shift): code, summary, price, meter, legal chips
//   bt_pricing     a GATED copy of the auto tint prices for the browser: an entry is copied only
//                  when priceFor() shows it in this build's mode, so draft numbers never reach the
//                  public HTML; legal_hold entries (full windshield film) are never copied
//   bt_noscript    the no-JS table: starting price per coverage and vehicle class (quoteFor)
//   bt_bodies      the inline SVG side profiles (geometry only; drawn facing left, floor y=290)
//   schema_ld      Breadcrumb, the one business node (#business), WebSite, WebPage
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const { priceFor, quoteFor, priceMode } = require("./lib/pricing");

const MODE = priceMode(process.env);
const DEFAULT = { vehicle: "car", current: "front", shade: { front: 35, rear: 15, back: 15, strip: 0 } };

// Plain object from a list, built with a loop (Eleventy's computed-data proxy can hand an array
// whose map results are not entry pairs on its dependency pass).
function byPanel(list, fn) { const o = {}; (list || []).forEach((p) => { if (p != null) o[p] = fn(p); }); return o; }
function byId(list) { const o = {}; list.forEach((x) => { o[x.id] = x; }); return o; }

function alpha(v) {
  return v ? (1 - Math.pow(v / 100, 1 / 2.2)).toFixed(3) : "0";
}

// Vehicle side profiles. Each body: outline path (paint), glass paths (one per window group; a
// path may hold several sub-shapes, e.g. rear door glass plus the quarter window), wheels, door
// seams, a shoulder highlight line, head and tail lamps, the mirror.
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
    seams: ["M268 196C266 216 266 238 268 258", "M434 186L434 262", "M552 182C552 196 552 208 550 214"],
    handles: ["M392 202L414 202", "M512 200L532 200"],
    shoulder: "M100 206C200 196 300 192 440 192C560 190 650 186 728 198",
    head: "M72 216C82 209 98 205 118 204L114 213C99 214 85 217 74 222Z",
    tail: "M720 186C727 189 731 194 732 202L732 210L718 207Z",
    mirror: "M290 186L304 174L318 176L314 186Z"
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
    seams: ["M274 162C272 190 272 226 274 256", "M454 156L454 258", "M566 152L566 212"],
    handles: ["M406 174L428 174", "M520 172L540 172"],
    shoulder: "M100 178C220 168 320 164 460 162C580 160 660 158 726 174",
    head: "M70 188C80 180 98 176 120 175L116 185C100 186 86 189 72 194Z",
    tail: "M716 140C722 150 726 160 728 172L728 188L716 184Z",
    mirror: "M294 156L308 144L322 146L318 156Z"
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
    seams: ["M270 158C268 186 268 226 270 256", "M398 150L398 258", "M482 156L482 230", "M494 166L744 166", "M742 166L742 252"],
    handles: ["M352 170L372 170", "M436 168L456 168"],
    shoulder: "M98 172C220 162 340 158 480 158L744 160",
    head: "M68 178C78 170 96 166 118 165L114 176C98 177 84 180 70 185Z",
    tail: "M744 168L750 170L751 204L744 204Z",
    mirror: "M288 152L302 140L316 142L312 152Z"
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
    seams: ["M222 182C220 206 220 236 222 258", "M390 172L390 262", "M546 168L546 262"],
    handles: ["M354 190L374 190", "M412 190L432 190"],
    shoulder: "M96 202C200 190 300 184 440 182C580 180 660 180 732 196",
    head: "M70 206C80 199 96 196 116 195L112 204C98 205 84 208 72 212Z",
    tail: "M726 150C730 160 733 172 734 184L734 200L724 196Z",
    mirror: "M240 182L254 170L268 172L264 182Z"
  }
];

// A gated copy of auto_tint for the browser: only entries that show in this mode, and only the
// fields builder.js reads. Everything else becomes { status: "unknown" }.
function gatedAutoTint(pricing) {
  const at = (pricing && pricing.auto_tint) || {};
  const classes = ((pricing && pricing.vehicle_classes) || []).map((c) => c.id);
  function slim(e) {
    const r = priceFor(e, MODE);
    if (!r.show) return { status: "unknown" };
    return { status: e.status, publish: e.publish === true, amount: e.amount, display: e.display };
  }
  const out = { coverage: {}, panels: {} };
  Object.keys(at.coverage || {}).forEach((k) => {
    const c = at.coverage[k];
    const o = { panels: (c.panels || []).slice() };
    classes.forEach((cl) => { o[cl] = slim(c[cl]); });
    out.coverage[k] = o;
  });
  Object.keys(at.panels || {}).forEach((k) => {
    const o = {};
    classes.forEach((cl) => { o[cl] = slim(at.panels[k][cl]); });
    out.panels[k] = o;
  });
  return { auto_tint: out };
}

module.exports = {
  eleventyComputed: {
    bt_mode: () => MODE,
    // Each body also gets its dark wheel wells: the arch cut out of the body, closed along the
    // rocker line (38 px wheels sit under 46 px arches on a 262 rocker, 40 px under 48 on 258).
    bt_bodies: () => BODIES.map((bd) => {
      const big = bd.r !== 38;
      const rocker = big ? 258 : 262, arch = big ? 48 : 46, half = big ? 47 : 45;
      const wells = bd.wheels.map((w) => "M" + (w[0] + half) + " " + rocker + "A" + arch + " " + arch + " 0 1 0 " + (w[0] - half) + " " + rocker + "Z");
      return Object.assign({}, bd, { wells });
    }),
    bt_body_ids: () => byId(BODIES),
    bt_shades: (data) => {
      const pr = data.pricing || {};
      const stocked = Array.isArray(pr.shades_installed) && pr.shades_installed.length ? pr.shades_installed : null;
      const values = stocked || (pr.example_shades && pr.example_shades.values) || [];
      const front = data.pages.build_your_tint.builder.front_min_vlt || 35;
      return {
        example: !stocked,
        label: stocked ? "" : (pr.example_shades && pr.example_shades.label) || "",
        // "None" first, then the shades from lightest to darkest, as the file lists them.
        items: [{ v: 0, a: "0" }].concat(values.map((v) => ({ v, a: alpha(v), below_front: v < front })))
      };
    },
    bt_pricing: (data) => gatedAutoTint(data.pricing),
    bt_init: (data) => {
      const pg = data.pages.build_your_tint;
      const b = pg.builder, T = b.text, L = b.legal;
      const order = b.panel_order;
      const veh = b.vehicles[DEFAULT.vehicle];
      const sh = DEFAULT.shade;
      const tpl = (s, map) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (map[k] != null ? map[k] : ""));
      const blocked = (p, v) => p === "front" && v > 0 && v < b.front_min_vlt;
      const legalFor = (p, v) => (!v ? L.none : p === "front" ? (v >= b.front_min_vlt ? L.front_ok : L.front_blocked) : p === "strip" ? L.strip : L.rear);
      const shadeText = (v) => (v ? v + "%" : T.none);
      const picked = order.filter((p) => sh[p] > 0);
      let price;
      if (!picked.length) price = { show: false, display: T.price_empty, draft: false };
      else if (picked.some((p) => blocked(p, sh[p]))) price = { show: false, display: T.price_blocked, draft: false };
      else price = quoteFor(data.pricing, veh.price_class, picked.map((p) => b.panels[p].price_key), MODE);
      const summary = [tpl(T.summary_intro, { vehicle: veh.label })].concat(order.map((p) => {
        const v = sh[p], map = { panel: b.panels[p].label, shade: shadeText(v) };
        return tpl(!v ? T.summary_no_film : blocked(p, v) ? T.summary_blocked : T.summary_panel, map);
      })).join(" ");
      const cur = DEFAULT.current;
      return {
        vehicle: DEFAULT.vehicle,
        current: cur,
        shade: sh,
        scene: (pg.stage && pg.stage.default_scene) || "dusk",
        code: "BC-" + veh.code + "-" + order.map((p) => sh[p] || 0).join("-"),
        summary,
        price,
        legal: byPanel(order, (p) => legalFor(p, sh[p])),
        shade_text: byPanel(order, (p) => shadeText(sh[p])),
        tint: byPanel(order, (p) => alpha(blocked(p, sh[p]) ? b.front_min_vlt : sh[p])),
        meter: { v: sh[cur], legal: legalFor(cur, sh[cur]) }
      };
    },
    bt_noscript: (data) => {
      const pr = data.pricing || {};
      const at = pr.auto_tint || {};
      const classes = pr.vehicle_classes || [];
      const rows = Object.keys(at.coverage || {}).map((k) => ({
        label: at.coverage[k].label,
        cells: classes.map((c) => quoteFor(pr, c.id, at.coverage[k].panels, MODE))
      }));
      return { classes, rows };
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
