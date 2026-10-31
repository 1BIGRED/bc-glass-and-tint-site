// Data for /build-your-tint (overhaul v3, WS4; blueprint 4.5, art direction 3.6, engineering 3.2.3).
// Wording: _data/pages/build_your_tint.json. Prices and presets: _data/pricing.json, only through
// lib/pricing.js (the gate). Code: lib/buildcode.js. Behavior: assets/v3/js/builder/50-builder.js.
//
// What this file builds:
//   bt_config   the ONE object the browser reads (script[data-bt-config]). Every price, preset and
//               add-on in it has passed the gate for this build's mode, so a production page never
//               carries a draft number, a draft preset or a "status":"draft" string. Front-door
//               shades darker than the legal line are never in it (they are not rendered at all).
//   bt_stage_svg the drawn vehicles: four classes x Side, Front, Rear (05-CAR-GRAPHIC-SPEC.md)
//   bt_bodies   per class the tile picture (side outline id, wheel centres, radius, viewBox)
//   bt_noscript the no-JS rules table
//   schema_ld   Breadcrumb, the one business node (#business), WebSite, WebPage
//
// builderConfig(pricing, pg, mode) is exported for tests\pricing.test.js.
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const P = require("./lib/pricing");

const MODE = P.priceMode(process.env);
const WINDOWS = ["front", "rear", "back"];

// ---------- The vehicle graphics (05-CAR-GRAPHIC-SPEC.md, "Technical line, lit glass") ----------
// Four generic everyday vehicles (sedan, SUV, crew-cab pickup, minivan), each in three views (Side,
// Front, Rear), drawn as inline SVG from the numbers below. No badge, emblem, grille pattern,
// signature lamp, lettering or logo; the cabin is always empty (no person). Units: overall length
// L = 1000 in Side; ground at y = GY. Proportions per spec 3 (wheelbase, overhangs, tire diameter,
// ground gap, belt line). Colors live in assets/v3/css/builder/50-builder.css, as classes only.
const GY = 400;
const F = (n) => Math.round(n);
// A vertex: [x, height above ground, kind]; kind "s" = smooth, a number = corner radius, none = sharp.
const V = (x, h, k) => [x, GY - h, k];

// pathD(vertices, closed) -> { d, pts }: smooth vertices get Catmull-Rom tangents, corners a
// rounded quadratic of the given radius. pts are samples along the curve (for boxes and offsets).
function pathD(vs, closed) {
  const n = vs.length;
  const at = (i) => vs[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (v) => Math.hypot(v[0], v[1]) || 1;
  const info = vs.map((v, i) => {
    const prev = at(i - 1), next = at(i + 1);
    if (v[2] === "s") {
      const t = sub(next, prev), l = len(t);
      return { s: true, inP: [v[0], v[1]], outP: [v[0], v[1]], t: [t[0] / l, t[1] / l] };
    }
    const r = typeof v[2] === "number" ? v[2] : 0;
    const d1 = len(sub(v, prev)), d2 = len(sub(next, v));
    const rr = (!closed && (i === 0 || i === n - 1)) ? 0 : Math.min(r, d1 / 2, d2 / 2);
    return {
      s: false, r: rr, v,
      inP: [v[0] + (prev[0] - v[0]) * rr / d1, v[1] + (prev[1] - v[1]) * rr / d1],
      outP: [v[0] + (next[0] - v[0]) * rr / d2, v[1] + (next[1] - v[1]) * rr / d2]
    };
  });
  const pts = [];
  const P = (p) => F(p[0]) + " " + F(p[1]);
  const cub = (a, b, c, d) => { for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; pts.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]); } };
  const quad = (a, b, c) => { for (let k = 1; k <= 4; k++) { const t = k / 4, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]); } };
  let d = "M" + P(info[0].outP);
  pts.push(info[0].outP);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const A = info[i], B = info[(i + 1) % n];
    const S = A.outP, E = B.inP;
    const dist = len(sub(E, S)) / 3;
    if (!A.s && !B.s) { d += "L" + P(E); pts.push(E); }
    else {
      const c1 = A.s ? [S[0] + A.t[0] * dist, S[1] + A.t[1] * dist] : [S[0] + (E[0] - S[0]) / 3, S[1] + (E[1] - S[1]) / 3];
      const c2 = B.s ? [E[0] - B.t[0] * dist, E[1] - B.t[1] * dist] : [E[0] - (E[0] - S[0]) / 3, E[1] - (E[1] - S[1]) / 3];
      d += "C" + P(c1) + " " + P(c2) + " " + P(E);
      cub(S, c1, c2, E);
    }
    if (!B.s && B.r > 0 && (closed || i + 1 < n - 1)) { d += "Q" + P(B.v) + " " + P(B.outP); quad(E, B.v, B.outP); }
  }
  return { d: d + (closed ? "Z" : ""), pts };
}
const closedD = (vs) => pathD(vs, true).d;
const openD = (vs) => pathD(vs, false).d;
function boxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  return { x: F(x0), y: F(y0), w: F(x1 - x0), h: F(y1 - y0) };
}
// mirror a left-half chain (top centre down to bottom centre, x < cx) into one closed shape
function mirrorClosed(half, cx) {
  const back = half.slice(1, -1).reverse().map((v) => [2 * cx - v[0], v[1], v[2]]);
  return half.concat(back);
}
const flipX = (vs, cx) => vs.map((v) => [2 * cx - v[0], v[1], v[2]]).reverse();
// Points along a sampled chain between x1 and x2, pushed d units along the inward normal (down).
function along(pts, x1, x2, dIn, hMin) {
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (p[0] < x1 || p[0] > x2) continue;
    if (hMin && GY - p[1] < hMin) continue;
    const a = pts[i - 1], b = pts[i + 1];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (ny < 0) { nx = -nx; ny = -ny; }
    out.push([p[0] + nx * dIn, p[1] + ny * dIn]);
  }
  return out;
}
// a thin glass sliver hugging the outline between x1 and x2, d1 to d2 units inside it
function sliver(pts, x1, x2, d1, d2, hMin) {
  const outer = along(pts, x1, x2, d1, hMin), inner = along(pts, x1, x2, d2, hMin);
  const thin = (list) => list.filter((p, i) => i === 0 || i === list.length - 1 || i % 3 === 0);
  const o = thin(outer), r = thin(inner).reverse();
  return o.map((p, i) => [p[0], p[1], i === 0 || i === o.length - 1 ? 3 : "s"]).concat(r.map((p, i) => [p[0], p[1], i === 0 || i === r.length - 1 ? 3 : "s"]));
}
// a straight-sided four-corner sliver from two edge lines (used for edge-on side glass in Front and Rear)
const quadV = (a, b, c, d2, r) => [a, b, c, d2].map((p) => [p[0], p[1], r]);

// ---- side view, one class ----
function wheelArchBottom(fx, rx, wh, R, rocker) {
  const dx = Math.sqrt(R * R - Math.pow(wh - rocker, 2));
  const y = GY - rocker;
  return { start: [fx - dx, rocker], end: [rx + dx, rocker], tail: "A" + R + " " + R + " 0 1 0 " + F(rx - dx) + " " + F(y) + "L" + F(fx + dx) + " " + F(y) + "A" + R + " " + R + " 0 1 0 " + F(fx - dx) + " " + F(y) + "Z" };
}
function seatSide(x, h0, h1, w, lean, hr) {
  // seat back: a slightly reclined rounded shape (front edge at x, rear edge at x + w), top at h1;
  // headrest: its own rounded shape on two short posts (hr = [height of gap, headrest height, depth])
  const back = closedD([V(x, h0, 4), V(x + lean * 0.55, (h0 + h1) / 2, "s"), V(x + lean - 2, h1 - 6, "s"), V(x + lean + w * 0.45, h1, "s"), V(x + lean + w + 1, h1 - 8, "s"), V(x + w + lean * 0.5, (h0 + h1) / 2, "s"), V(x + w + 2, h0, 4)]);
  const rim = openD([V(x + lean - 2, h1 - 6, "s"), V(x + lean + w * 0.45, h1, "s"), V(x + lean + w + 1, h1 - 8, "s")]);
  const hx = x + lean + w * 0.12, hb = h1 + hr[0], ht = hb + hr[1], hd = hr[2];
  const head = closedD([V(hx, hb, 5), V(hx - 2, ht - 6, "s"), V(hx + hd * 0.45, ht, "s"), V(hx + hd + 2, ht - 7, "s"), V(hx + hd, hb, 5)]);
  const posts = "M" + F(hx + hd * 0.3) + " " + F(GY - hb) + "V" + F(GY - h1 + 1) + "M" + F(hx + hd * 0.72) + " " + F(GY - hb) + "V" + F(GY - h1 + 1);
  const headRim = openD([V(hx - 2, ht - 6, "s"), V(hx + hd * 0.45, ht, "s"), V(hx + hd + 2, ht - 7, "s")]);
  return { back, rim, head, posts, headRim };
}

// Class data. Wheel centres fx, rx; tire radius r; rocker = ground gap; belt = belt line height.
const SIDE = {
  car: {
    fx: 200, rx: 780, r: 70, R: 78, rocker: 32, rimK: 0.62,
    chain: [V(30, 32, 10), V(3, 44, 8), V(0, 80, "s"), V(2, 108, "s"), V(14, 126, 12), V(80, 141, "s"), V(190, 161, "s"), V(300, 171, 10), V(425, 254, "s"), V(500, 284, "s"), V(592, 295, "s"), V(684, 285, "s"), V(762, 247, "s"), V(848, 205, "s"), V(948, 196, "s"), V(990, 183, 12), V(1000, 148, "s"), V(997, 92, "s"), V(985, 45, 12), V(962, 34)],
    panels: {
      front: [[V(358, 186, 6), V(436, 250, "s"), V(484, 274, "s"), V(530, 281, "s"), V(564, 282, 6), V(561, 188, 6)]],
      rear: [[V(578, 189, 6), V(581, 282, 6), V(648, 279, "s"), V(716, 259, "s"), V(783, 204, 8)]]
    },
    back: [728, 842, 5, 13, 190],
    seams: [openD([V(320, 176, "s"), V(308, 110, "s"), V(314, 36, "s")]), "M570 " + (GY - 182) + "L572 " + (GY - 34), openD([V(786, 192, "s"), V(770, 166, "s"), V(730, 145, "s"), V(704, 114, "s"), V(698, 36, "s")])],
    crease: [V(296, 168, "s"), V(600, 177, "s"), V(975, 180, "s")],
    rockerLine: [282, 700, 46],
    bumper: [V(2, 64, "s"), V(40, 65, "s"), V(96, 68, "s")],
    handles: [[470, 172], [690, 174]],
    mirror: [V(330, 186, 4), V(318, 204, 6), V(352, 206, 6), V(366, 190, 4)],
    lamps: { head: [V(5, 104, 5), V(9, 118, 5), V(90, 132, 6), V(84, 118, 6)], tail: [V(950, 190, 6), V(992, 178, 6), V(996, 158, 6), V(960, 170, 6)] },
    cabin: { trim: [330, 800, 186, 209], pillar: [590, 604], seats: [[500, 170, 252, 36, 10, [7, 28, 30]], [700, 172, 240, 40, 4, [6, 22, 28]]], wheel: [[392, 188], [408, 216]], cal: [[446, 222], [608, 222]] },
    width: 376
  },
  suv: {
    fx: 200, rx: 790, r: 82, R: 92, rocker: 45, rimK: 0.62,
    chain: [V(30, 50, 10), V(4, 62, 8), V(0, 110, "s"), V(2, 170, "s"), V(10, 196, 12), V(80, 206, "s"), V(200, 214, "s"), V(300, 220, 10), V(382, 300, "s"), V(432, 346, "s"), V(520, 358, "s"), V(820, 360, "s"), V(938, 356, "s"), V(970, 346, 12), V(990, 280, "s"), V(998, 220, "s"), V(1000, 130, "s"), V(990, 58, 12), V(962, 48)],
    panels: {
      front: [[V(342, 222, 6), V(400, 280, "s"), V(442, 326, "s"), V(482, 340, "s"), V(530, 345, "s"), V(562, 346, 6), V(560, 224, 6)]],
      rear: [[V(577, 224, 6), V(579, 346, 6), V(734, 346, 6), V(732, 227, 6)], [V(750, 227, 6), V(752, 346, 6), V(898, 344, 10), V(934, 233, 8)]]
    },
    back: [930, 995, 5, 13, 240],
    seams: [openD([V(318, 234, "s"), V(306, 150, "s"), V(312, 48, "s")]), "M569 " + (GY - 216) + "L571 " + (GY - 47), openD([V(742, 218, "s"), V(742, 190, "s"), V(728, 166, "s"), V(704, 140, "s"), V(690, 100, "s"), V(693, 48, "s")])],
    crease: [V(300, 200, "s"), V(640, 206, "s"), V(985, 208, "s")],
    rockerLine: [302, 688, 64],
    bumper: [V(2, 92, "s"), V(50, 94, "s"), V(96, 96, "s")],
    handles: [[476, 206], [670, 208]],
    mirror: [V(352, 222, 4), V(340, 242, 6), V(374, 244, 6), V(386, 226, 4)],
    lamps: { head: [V(5, 168, 5), V(8, 184, 5), V(96, 196, 6), V(90, 182, 6)], tail: [V(968, 330, 6), V(990, 266, 6), V(995, 244, 6), V(978, 292, 6)] },
    rails: [V(470, 364, "s"), V(700, 366, "s"), V(920, 362, "s")],
    cladding: 12,
    cabin: { trim: [330, 960, 221, 250], pillar: [592, 606], seats: [[500, 204, 302, 40, 10, [8, 32, 32]], [690, 208, 296, 44, 6, [7, 28, 30]]], wheel: [[392, 226], [410, 256]], cal: [[440, 268], [612, 268]] },
    width: 405
  },  pickup: {
    fx: 170, rx: 785, r: 70, R: 78, rocker: 40, rimK: 0.6,
    chain: [V(30, 44, 12), V(4, 80, "s"), V(0, 132, "s"), V(4, 196, 10), V(90, 214, "s"), V(240, 226, "s"), V(300, 231, 10), V(404, 314, "s"), V(452, 329, "s"), V(540, 333, "s"), V(652, 331, 10), V(672, 300, "s"), V(676, 224, 4), V(996, 224, 4), V(1000, 196, "s"), V(1000, 100, "s"), V(994, 56, 10), V(976, 44)],
    panels: {
      front: [[V(330, 213, 6), V(404, 295, "s"), V(446, 316, "s"), V(492, 321, "s"), V(512, 321, 6), V(510, 215, 6)]],
      rear: [[V(526, 215, 6), V(528, 321, 6), V(632, 320, 8), V(650, 304, "s"), V(654, 216, 6)]]
    },
    backQuad: [V(660, 246, 3), V(662, 312, 3), V(669, 312, 3), V(667, 246, 3)],
    seams: [openD([V(294, 226, "s"), V(284, 150, "s"), V(290, 42, "s")]), "M518 " + (GY - 214) + "L520 " + (GY - 42), openD([V(668, 214, "s"), V(668, 120, "s"), V(674, 42, "s")]), "M684 " + (GY - 222) + "L686 " + (GY - 52), "M984 " + (GY - 222) + "L984 " + (GY - 60), "M690 " + (GY - 214) + "L980 " + (GY - 214)],
    crease: [V(40, 190, "s"), V(300, 206, "s"), V(660, 208, "s")],
    rockerLine: [254, 670, 56],
    handles: [[456, 202], [600, 202], [950, 196]],
    mirror: [V(344, 214, 4), V(330, 238, 6), V(366, 240, 6), V(380, 218, 4)],
    lamps: { head: [V(6, 192, 6), V(64, 200, "s"), V(80, 196, 6), V(14, 172, 6)], tail: [V(988, 218, 4), V(998, 218, 4), V(998, 168, 4), V(988, 168, 4)] },
    cabin: { trim: [320, 664, 213, 240], pillar: [540, 554], seats: [[460, 196, 286, 38, 8, [8, 28, 30]], [610, 198, 284, 36, 3, [7, 24, 28]]], wheel: [[384, 216], [400, 244]], cal: [[410, 250], [566, 250]] },
    width: 345
  },
  van: {
    fx: 200, rx: 792, r: 71, R: 80, rocker: 32, rimK: 0.62,
    chain: [V(28, 32, 10), V(3, 46, 8), V(0, 84, "s"), V(3, 118, "s"), V(16, 140, 12), V(90, 162, "s"), V(178, 183, 10), V(300, 268, "s"), V(392, 322, "s"), V(472, 336, "s"), V(820, 338, "s"), V(930, 333, "s"), V(968, 318, 12), V(990, 230, "s"), V(998, 180, "s"), V(1000, 110, "s"), V(988, 44, 12), V(962, 34)],
    panels: {
      front: [[V(234, 191, 6), V(300, 246, "s"), V(368, 300, "s"), V(420, 318, "s"), V(454, 322, 6), V(451, 193, 6)]],
      rear: [[V(468, 194, 6), V(470, 323, 6), V(690, 324, 6), V(689, 197, 6)], [V(706, 197, 6), V(707, 324, 6), V(934, 322, 10), V(956, 202, 6)]]
    },
    back: [966, 994, 5, 12, 206],
    seams: [openD([V(232, 189, "s"), V(246, 160, "s"), V(272, 130, "s"), V(286, 90, "s"), V(288, 36, "s")]), "M460 " + (GY - 188) + "L462 " + (GY - 34), "M698 " + (GY - 190) + "L700 " + (GY - 34)],
    track: [V(700, 186, "s"), V(820, 186, "s"), V(958, 190, "s")],
    crease: [V(60, 150, "s"), V(300, 174, "s"), V(700, 180, "s"), V(985, 182, "s")],
    rockerLine: [276, 714, 46],
    bumper: [V(2, 62, "s"), V(50, 64, "s"), V(104, 66, "s")],
    handles: [[396, 178], [490, 178]],
    mirror: [V(250, 192, 4), V(238, 212, 6), V(272, 214, 6), V(284, 196, 4)],
    lamps: { head: [V(6, 116, 5), V(10, 130, 5), V(98, 152, 6), V(92, 138, 6)], tail: [V(962, 300, 6), V(986, 240, 6), V(992, 214, 6), V(970, 262, 6)] },
    cabin: { trim: [228, 964, 192, 224], pillar: [480, 494], seats: [[392, 176, 270, 38, 10, [8, 30, 30]], [592, 180, 266, 34, 6, [7, 26, 28]], [800, 184, 258, 40, 4, [6, 24, 28]]], wheel: [[330, 198], [348, 226]], cal: [[364, 262], [520, 262]] },
    width: 390
  }
};

// Front and Rear views. Centre x = 500. hw half width at the shoulder, H roof, rw roof half width,
// belt, ws = windshield or back glass [bottom h, bottom half width, top h, top half width].
const ENDS = {
  car: {
    H: 295, hw: 188, rw: 128, belt: 168, bottom: 34, track: 158, tireW: 48, tireTop: 56,
    front: { ws: [166, 152, 280, 112], hood: 152, grille: [424, 576, 60, 100], lamps: [[322, 404, 110, 126]], bumper: 52 },
    rear: { ws: [204, 142, 280, 110], deck: 194, lamps: [[316, 398, 146, 176]], bumper: 64, plate: [458, 542, 86, 112] }
  },
  suv: {
    H: 360, hw: 202, rw: 152, belt: 222, bottom: 46, track: 168, tireW: 54, tireTop: 70,
    front: { ws: [222, 162, 344, 134], hood: 206, grille: [410, 590, 98, 150], lamps: [[316, 400, 166, 182]], bumper: 76 },
    rear: { ws: [236, 156, 342, 138], deck: 226, lamps: [[306, 338, 156, 210]], bumper: 80, plate: [456, 544, 110, 140] }
  },
  pickup: {
    H: 330, hw: 172, rw: 138, belt: 226, bottom: 44, track: 146, tireW: 52, tireTop: 64,
    front: { ws: [232, 142, 318, 120], hood: 222, grille: [384, 616, 104, 192], lamps: [[334, 378, 148, 194]], bumper: 76 },
    rear: { ws: [252, 98, 304, 92], deck: 224, cab: [146, 252], lamps: [[330, 346, 150, 214]], bumper: 76, plate: [456, 544, 92, 118], gate: [338, 662, 82, 220] }
  },
  van: {
    H: 338, hw: 195, rw: 168, belt: 198, bottom: 34, track: 164, tireW: 48, tireTop: 58,
    front: { ws: [184, 168, 322, 152], hood: 168, grille: [420, 580, 70, 106], lamps: [[314, 404, 128, 144]], bumper: 52 },
    rear: { ws: [214, 158, 318, 148], deck: 206, lamps: [[310, 334, 118, 186]], bumper: 64, plate: [458, 542, 92, 118] }
  }
};

// Build every view of every class: { id, views: { side, front, rear } }, each view
// { bb, defs (cabin), body (markup), outline (for the vehicle tile) }.
function wheelsMarkup(cx, cyH, r, rimK) {
  const cy = GY - cyH;
  return '<circle class="bt-tire" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' +
    '<circle class="bt-dt" cx="' + cx + '" cy="' + cy + '" r="' + F(r * rimK) + '"/>' +
    '<circle class="bt-dt bt-d2" cx="' + cx + '" cy="' + cy + '" r="' + F(r * rimK * 0.74) + '"/>' +
    '<circle class="bt-dt" cx="' + cx + '" cy="' + cy + '" r="' + F(r * 0.13) + '"/>';
}
function streaks(b, lean) {
  // two parallel diagonal streaks leaning back about 20 degrees (spec 5.5)
  const sh = F(b.h * 0.36) * (lean || 1);
  const one = (cx, w) => { const x0 = F(b.x + b.w * cx - sh / 2); return "M" + x0 + " " + (b.y + b.h + 4) + "h" + F(w) + "l" + sh + " " + -(b.h + 8) + "h" + -F(w) + "Z"; };
  return { wide: one(0.36, Math.max(4, b.w * 0.14)), thin: one(0.6, Math.max(2, b.w * 0.04)) };
}
function panelMarkup(key, kind, id, subs, opt) {
  // kind "win" (data-win) | "addon" (data-addon) | "fixed" (windshield below the strip)
  const all = [];
  const boxes = [];
  const d = subs.map((s) => { const r = pathD(s, true); all.push.apply(all, r.pts); boxes.push(boxOf(r.pts)); return r.d; }).join("");
  const b = boxOf(all);
  const g = "btg-" + key, c = "btc-" + key, t = "btt-" + key;
  const pad = 6;
  const R = (cls, extra) => '<rect class="' + cls + '" x="' + (b.x - pad) + '" y="' + (b.y - pad) + '" width="' + (b.w + 2 * pad) + '" height="' + (b.h + 2 * pad) + '"' + (extra || "") + "/>";
  // each piece of glass (rear door, quarter, each edge sliver) gets its own pair of streaks
  const st = { wide: "", thin: "" };
  boxes.forEach((bx) => { const one = streaks(bx, opt.lean); st.wide += one.wide; st.thin += one.thin; });
  let s = "<defs>" + '<path id="' + g + '" d="' + d + '"/>' + '<clipPath id="' + c + '"><use href="#' + g + '"/></clipPath>' +
    '<clipPath id="' + t + '"><rect x="' + (b.x - pad) + '" y="' + (b.y - pad) + '" width="' + (b.w + 2 * pad) + '" height="' + F(Math.max(8, b.h * 0.18) + pad) + '"/></clipPath></defs>';
  const attr = kind === "win" ? ' class="bt-win" data-win="' + id + '"' : kind === "addon" ? ' class="bt-win bt-add" data-addon="' + id + '"' : ' class="bt-glass-fixed"';
  s += "<g" + attr + ">";
  s += '<g clip-path="url(#' + c + ')">' + R("bt-win__base") + R("bt-win__outside");
  if (opt.far) s += R("bt-win__far", ' data-far="' + opt.far + '"');
  s += '<use class="bt-win__cabin" href="#' + opt.cabin + '"/>';
  // the calibration patch for the transmission test (spec 9 item 11): part of the cabin layer
  // (above the far pane, under the near pane), drawn in the panel itself so the test attribute
  // reaches it directly
  if (opt.cal) s += cal(opt.cal[0], opt.cal[1]);
  if (kind !== "fixed") s += R("bt-win__tint", ' data-tint="' + id + '"');
  // Stroked copies are real paths, not <use>: vector-effect is not inherited, and a stroke drawn
  // through <use> measured in SVG units (the 24px tap stroke came out 7px wide at 390).
  const sp = (cls, extra) => '<path class="' + cls + '" d="' + d + '"' + (extra || "") + "/>";
  s += '<g class="bt-refl">' + R("bt-refl__veil") + '<path class="bt-refl__wide" d="' + st.wide + '"/><path class="bt-refl__thin" d="' + st.thin + '"/>' +
    sp("bt-refl__top", ' clip-path="url(#' + t + ')"') + "</g>";
  s += "</g>";
  s += sp("bt-win__edge");
  if (kind !== "fixed") {
    if (opt.thin) s += sp("bt-win__hit");
    s += sp("bt-win__key") + sp("bt-win__ring");
  }
  s += "</g>";
  return { markup: s, box: b, pts: all };
}

function seatMarkup(st) {
  return '<path class="bt-seat" d="' + st.back + '"/><path class="bt-seat__rim" d="' + st.rim + '"/>' +
    '<path class="bt-seat__post" d="' + st.posts + '"/><path class="bt-seat" d="' + st.head + '"/><path class="bt-seat__rim" d="' + st.headRim + '"/>';
}
const cal = (x, y, s) => '<rect class="bt-cal" x="' + F(x) + '" y="' + F(y) + '" width="' + (s || 20) + '" height="' + (s || 20) + '"/>';

function sideView(id) {
  const c = SIDE[id];
  const arch = wheelArchBottom(c.fx, c.rx, c.r, c.R, c.rocker);
  const chain = [V(arch.start[0], arch.start[1])].concat(c.chain, [V(arch.end[0], arch.end[1])]);
  const top = pathD(chain, false);
  const bodyD = top.d + arch.tail;
  const key = id + "-side";
  const cab = c.cabin;
  // cabin: far-side door trim and sill, far-side pillar, seats, steering wheel arc, calibration patches
  let cabin = '<g id="btcab-' + key + '">' +
    '<rect class="bt-cab__trim" x="' + cab.trim[0] + '" y="' + (GY - cab.trim[3]) + '" width="' + (cab.trim[1] - cab.trim[0]) + '" height="' + (cab.trim[3] - cab.trim[2] + 30) + '"/>' +
    '<path class="bt-cab__sill" d="M' + cab.trim[0] + " " + (GY - cab.trim[3]) + "H" + cab.trim[1] + '"/>' +
    '<rect class="bt-cab__trim" x="' + cab.pillar[0] + '" y="' + (GY - c.H_ - 20) + '" width="' + (cab.pillar[1] - cab.pillar[0]) + '" height="200"/>';
  cab.seats.forEach((s) => { cabin += seatMarkup(seatSide(s[0], s[1], s[2], s[3], s[4], s[5])); });
  cabin += '<path class="bt-cab__wheel" d="' + openD([V(cab.wheel[0][0], cab.wheel[0][1], "s"), V((cab.wheel[0][0] + cab.wheel[1][0]) / 2 - 5, (cab.wheel[0][1] + cab.wheel[1][1]) / 2, "s"), V(cab.wheel[1][0], cab.wheel[1][1], "s")]) + '"/>';
  // spec 7.2: the cabin symbol carries the calibration patches; each panel repeats its own patch at
  // the same coordinates (panelMarkup), because Chrome does not restyle a <use> copy when the test
  // attribute is set after load (measured: the cabin copy stayed hidden)
  cab.cal.forEach((p) => { cabin += cal(p[0], GY - p[1] - 20); });
  cabin += "</g>";
  // glass
  let glass = "";
  ["front", "rear"].forEach((w, i) => { glass += panelMarkup(key + "-" + w, "win", w, c.panels[w], { far: w, cabin: "btcab-" + key, cal: [cab.cal[i][0], GY - cab.cal[i][1] - 20] }).markup; });
  const backV = c.backQuad || sliver(top.pts, c.back[0], c.back[1], c.back[2], c.back[3], c.back[4]);
  glass += panelMarkup(key + "-back", "win", "back", [backV], { far: "back", cabin: "btcab-" + key, thin: true }).markup;
  // line work
  let lines = '<g class="bt-lines">';
  lines += '<path class="bt-ln" d="' + bodyD + '"/>';
  c.seams.forEach((s) => { lines += '<path class="bt-dt" d="' + s + '"/>'; });
  const crease = openD(c.crease);
  lines += '<path class="bt-dt" d="' + crease + '"/><path class="bt-hl" d="' + openD(c.crease.map((v) => [v[0], v[1] - 1.5, v[2]])) + '"/>';
  lines += '<path class="bt-dt" d="M' + c.rockerLine[0] + " " + (GY - c.rockerLine[2]) + "H" + c.rockerLine[1] + '"/>';
  if (c.track) lines += '<path class="bt-dt" d="' + openD(c.track) + '"/>';
  if (c.bumper) lines += '<path class="bt-dt" d="' + openD(c.bumper) + '"/>';
  if (c.rails) lines += '<path class="bt-dt" d="' + openD(c.rails) + '"/>';
  if (c.cladding) {
    // SUV wheel-arch trim: one line around each arch, a little outside it
    const R2 = c.R + c.cladding, dx2 = Math.sqrt(R2 * R2 - Math.pow(c.r - c.rocker, 2)), y = GY - c.rocker;
    [c.fx, c.rx].forEach((x) => { lines += '<path class="bt-dt" d="M' + F(x - dx2) + " " + y + "A" + R2 + " " + R2 + " 0 1 1 " + F(x + dx2) + " " + y + '"/>'; });
  }
  c.handles.forEach((h) => { lines += '<rect class="bt-dt bt-d2" x="' + (h[0] - 14) + '" y="' + (GY - h[1] - 3) + '" width="28" height="6" rx="3"/>'; });
  lines += '<path class="bt-mirror" d="' + closedD(c.mirror) + '"/>';
  lines += '<path class="bt-dt" d="' + closedD(c.lamps.head) + '"/><path class="bt-dt" d="' + closedD(c.lamps.tail) + '"/>';
  lines += wheelsMarkup(c.fx, c.r, c.r, c.rimK) + wheelsMarkup(c.rx, c.r, c.r, c.rimK);
  lines += "</g>";
  const shadow = '<ellipse class="bt-shadow" cx="500" cy="' + (GY + 2) + '" rx="460" ry="18"/>' +
    '<ellipse class="bt-contact" cx="' + c.fx + '" cy="' + (GY + 1) + '" rx="' + F(c.r * 0.9) + '" ry="6"/><ellipse class="bt-contact" cx="' + c.rx + '" cy="' + (GY + 1) + '" rx="' + F(c.r * 0.9) + '" ry="6"/>';
  const bb = boxOf(top.pts.concat([[0, GY + 20], [1000, GY + 20]]));
  const body = shadow + '<path class="bt-bodyfill" d="' + bodyD + '"/>' + glass + lines;
  return { key, bb, cabin, body, outline: bodyD, wheels: [[c.fx, GY - c.r], [c.rx, GY - c.r]], r: c.r };
}

function endView(id, which) {
  const e = ENDS[id], v = e[which], cx = 500;
  const key = id + "-" + which;
  const hw = e.hw, H = e.H;
  const isPickupRear = id === "pickup" && which === "rear";
  // silhouette: roof, greenhouse sides (tumblehome), shoulder, body side, bumper, bottom
  // roof with a soft crown and large corners, tumblehome down to the shoulder, a body side that
  // swells a little at the wheel line, and a bottom corner that stays wide over the tires
  const crown = id === "car" ? 3 : 2;
  const mid = (e.belt + e.bottom) / 2;
  // The bottom edge: the fender lip over each tire (a wheel opening at the corner) and the lower
  // bumper between them, so the tires sit in the corners instead of hanging under the body.
  const lip = e.bottom + 4, tin = 6, tout = tin + e.tireW + 10;
  const bottomHalf = (sideTop) => [V(cx - hw, lip + 8, 6), V(cx - hw + 2, lip, 3), V(cx - hw + tout, lip, 8), V(cx - hw + tout + 6, e.bottom, 6), V(cx, e.bottom)];
  const half = [V(cx, H), V(cx - e.rw * 0.55, H - crown, "s"), V(cx - e.rw, H - 10, 22), V(cx - hw + 12, e.belt + 2, 10), V(cx - hw - 1, e.belt - 16, "s"), V(cx - hw - 3, mid, "s")].concat(bottomHalf());
  let shape = mirrorClosed(half, cx);
  if (isPickupRear) {
    // the cab sits above the bed: the bed sides and tailgate top end at the deck line
    const cabW = v.cab[0];
    const ph = [V(cx, H), V(cx - cabW * 0.6, H - 2, "s"), V(cx - cabW, H - 10, 18), V(cx - cabW - 8, v.deck + 2, 4), V(cx - hw, v.deck, 4), V(cx - hw - 2, (v.deck + lip) / 2, "s")].concat(bottomHalf());
    shape = mirrorClosed(ph, cx);
  }
  const outline = pathD(shape, true);
  // tires sit in the wheel openings, under the fenders (the body is drawn over their tops)
  const tires = [-1, 1].map((sgn) => { const x = sgn < 0 ? cx - hw + tin : cx + hw - tin - e.tireW; return '<rect class="bt-tire" x="' + F(x) + '" y="' + (GY - lip - 14) + '" width="' + e.tireW + '" height="' + (lip + 14) + '" rx="9"/>'; }).join("");
  e.track = hw - tin - e.tireW / 2;
  const ws = v.ws; // [bh, bhw, th, thw]
  const wsAt = (h) => { const t = (h - ws[0]) / (ws[2] - ws[0]); return ws[1] + (ws[3] - ws[1]) * t; };
  // edge-on side glass (front door glass in Front, rear door glass in Rear): a sliver inside the
  // greenhouse side from the belt to the roof corner
  const gh = isPickupRear ? [cx - v.cab[0] - 8, v.deck + 4, cx - v.cab[0], H - 10] : [cx - hw + 10, e.belt + 6, cx - e.rw, H - 10];
  const sl = (sgn) => {
    const X = (x) => cx + sgn * (x - cx);
    const a = [X(gh[0] + 2), GY - gh[1] - 4], b = [X(gh[2] + 1), GY - gh[3] + 4], c2 = [X(gh[2] + 9), GY - gh[3] + 6], d2 = [X(gh[0] + 11), GY - gh[1] - 4];
    return quadV(a, b, c2, d2, 2);
  };
  const sideId = which === "front" ? "front" : "rear";
  const cabKey = "btcab-" + key;
  let glass = "";
  glass += panelMarkup(key + "-" + sideId, "win", sideId, [sl(-1), sl(1)], { far: sideId, cabin: cabKey, thin: true }).markup;
  if (which === "front") {
    const sh = ws[2] - (ws[2] - ws[0]) * 0.16;
    const strip = [V(cx - wsAt(sh), sh, 0), V(cx - ws[3], ws[2], 10), V(cx + ws[3], ws[2], 10), V(cx + wsAt(sh), sh, 0)];
    const lower = [V(cx - ws[1], ws[0], 10), V(cx - wsAt(sh), sh, 0), V(cx + wsAt(sh), sh, 0), V(cx + ws[1], ws[0], 10)];
    glass += panelMarkup(key + "-ws", "fixed", "", [lower], { far: "back", cabin: cabKey }).markup;
    glass += panelMarkup(key + "-strip", "addon", "top-strip", [strip], { far: "back", cabin: cabKey, thin: true }).markup;
  } else {
    const bg = [V(cx - ws[1], ws[0], 10), V(cx - ws[3], ws[2], 12), V(cx + ws[3], ws[2], 12), V(cx + ws[1], ws[0], 10)];
    glass += panelMarkup(key + "-back", "win", "back", [bg], { cabin: cabKey, cal: [cx - 10, GY - ws[0] - (ws[2] - ws[0]) * 0.72 - 10] }).markup;
  }
  // cabin
  const bh = ws[0], th = ws[2], gH = th - bh;
  let cabin = '<g id="' + cabKey + '">';
  // Seats seen end-on are drawn as furniture, never as a figure: a headrest is a wide, flat
  // rounded rectangle on two visible posts, and a seat back is broader than it is tall at the top,
  // with square shoulders (no head-and-shoulders silhouette).
  const headrest = (x, h, w, hh) => '<path class="bt-seat" d="' + closedD([V(x - w / 2, h, 5), V(x - w / 2, h + hh, 7), V(x + w / 2, h + hh, 7), V(x + w / 2, h, 5)]) + '"/>' +
    '<path class="bt-seat__rim" d="' + openD([V(x - w / 2 + 4, h + hh, 0), V(x + w / 2 - 4, h + hh, 0)]) + '"/>';
  const seatBack = (x, h0, h1, w) => '<path class="bt-seat" d="' + closedD([V(x - w / 2, h0, 4), V(x - w / 2 + 1, h1, 9), V(x + w / 2 - 1, h1, 9), V(x + w / 2, h0, 4)]) + '"/>' +
    '<path class="bt-seat__rim" d="' + openD([V(x - w / 2 + 8, h1, 0), V(x + w / 2 - 8, h1, 0)]) + '"/>';
  const posts = (x, h0, h1, gap) => '<path class="bt-seat__post" d="M' + F(x - gap) + " " + F(GY - h0) + "V" + F(GY - h1) + "M" + F(x + gap) + " " + F(GY - h0) + "V" + F(GY - h1) + '"/>';
  const sx = e.hw * 0.38; // seat centre offset from the middle
  if (which === "front") {
    // looking in through the windshield: rear headrests small and far, front seats near, dash top
    // line, steering wheel ring on the driver's side (the vehicle's left, the viewer's right)
    const rh = bh + gH * 0.5, fh = bh + gH * 0.3;
    cabin += headrest(cx - sx * 0.8, rh + 4, 32, 12) + headrest(cx + sx * 0.8, rh + 4, 32, 12);
    cabin += seatBack(cx - sx, bh - 10, fh + 6, 72) + seatBack(cx + sx, bh - 10, fh + 6, 72);
    cabin += posts(cx - sx, fh + 6, fh + 16, 10) + posts(cx + sx, fh + 6, fh + 16, 10);
    cabin += headrest(cx - sx, fh + 15, 46, 18) + headrest(cx + sx, fh + 15, 46, 18);
    cabin += '<rect class="bt-cab__trim" x="' + (cx - ws[1] - 10) + '" y="' + F(GY - bh - gH * 0.12) + '" width="' + (2 * ws[1] + 20) + '" height="60"/>';
    cabin += '<path class="bt-cab__sill" d="M' + (cx - ws[1] - 10) + " " + F(GY - bh - gH * 0.12) + "H" + (cx + ws[1] + 10) + '"/>';
    cabin += '<circle class="bt-cab__wheel" cx="' + F(cx + sx) + '" cy="' + F(GY - bh - gH * 0.12 - 4) + '" r="' + F(gH * 0.17) + '"/>';
    cabin += cal(cx - 10, GY - bh - gH * 0.62 - 10);

  } else {
    // looking in through the back glass: rear seat backs and headrests near and large, front
    // headrests small beyond
    const fh = bh + gH * 0.42, rh = bh + gH * 0.12;
    cabin += headrest(cx - sx * 0.8, fh + 2, 30, 11) + headrest(cx + sx * 0.8, fh + 2, 30, 11);
    cabin += '<path class="bt-seat" d="' + closedD([V(cx - ws[1] + 6, bh - 20, 4), V(cx - ws[1] + 10, rh, 8), V(cx + ws[1] - 10, rh, 8), V(cx + ws[1] - 6, bh - 20, 4)]) + '"/>';
    cabin += '<path class="bt-seat__rim" d="M' + F(cx - ws[1] + 14) + " " + F(GY - rh) + "H" + F(cx + ws[1] - 14) + '"/>';
    cabin += posts(cx - sx, rh, rh + 10, 11) + posts(cx + sx, rh, rh + 10, 11);
    cabin += headrest(cx - sx, rh + 9, 54, 20) + headrest(cx + sx, rh + 9, 54, 20);
    cabin += cal(cx - 10, GY - ws[0] - (ws[2] - ws[0]) * 0.72 - 10);

  }
  cabin += "</g>";
  // line work
  let lines = '<g class="bt-lines"><path class="bt-ln" d="' + outline.d + '"/>';
  // greenhouse outer line at the belt (shoulder), and the A or C pillars: the glass opening outline
  lines += '<path class="bt-dt" d="M' + F(cx - hw + 8) + " " + (GY - (isPickupRear ? v.deck : e.belt)) + "H" + F(cx + hw - 8) + '"/>';
  const mir = (sgn) => { const X = (x) => cx + sgn * (x - cx); return closedD([V(X(cx - hw + 4), e.belt + 4, 3), V(X(cx - hw - 24), e.belt + 2, 6), V(X(cx - hw - 26), e.belt - 18, 6), V(X(cx - hw + 2), e.belt - 14, 3)]); };
  if (!isPickupRear) lines += '<path class="bt-mirror" d="' + mir(-1) + mir(1) + '"/>';
  else lines += '<path class="bt-mirror" d="' + closedD([V(cx - v.cab[0] - 8, v.deck + 34, 3), V(cx - hw - 24, v.deck + 34, 6), V(cx - hw - 26, v.deck + 14, 6), V(cx - v.cab[0] - 8, v.deck + 14, 3)]) + closedD([V(cx + v.cab[0] + 8, v.deck + 34, 3), V(cx + hw + 24, v.deck + 34, 6), V(cx + hw + 26, v.deck + 14, 6), V(cx + v.cab[0] + 8, v.deck + 14, 3)]) + '"/>';
  if (which === "front") {
    lines += '<path class="bt-dt" d="' + openD([V(cx - hw + 14, v.hood - 8, "s"), V(cx, v.hood, "s"), V(cx + hw - 14, v.hood - 8, "s")]) + '"/>';
    const g = v.grille;
    lines += '<rect class="bt-dt" x="' + g[0] + '" y="' + (GY - g[3]) + '" width="' + (g[1] - g[0]) + '" height="' + (g[3] - g[2]) + '" rx="14"/>';
    lines += '<path class="bt-dt" d="M' + (g[0] + 6) + " " + F(GY - (g[2] + g[3]) / 2) + "H" + (g[1] - 6) + '"/>';
  } else if (!isPickupRear) {
    // the trunk or liftgate line spans only the body width at its own height (above the belt the
    // greenhouse narrows toward the roof), so it never pokes past the outline
    const gwAt = (h) => (h <= e.belt ? hw - 14 : (hw - 14) + (e.rw - 10 - (hw - 14)) * (h - e.belt) / (H - 10 - e.belt)) - 8;
    const dw = gwAt(v.deck);
    lines += '<path class="bt-dt" d="' + openD([V(cx - dw, v.deck - 4, "s"), V(cx, v.deck, "s"), V(cx + dw, v.deck - 4, "s")]) + '"/>';
    const p = v.plate;
    lines += '<rect class="bt-dt bt-d2" x="' + p[0] + '" y="' + (GY - p[3]) + '" width="' + (p[1] - p[0]) + '" height="' + (p[3] - p[2]) + '" rx="4"/>';
  } else {
    const gt = v.gate, p = v.plate;
    lines += '<rect class="bt-dt" x="' + gt[0] + '" y="' + (GY - gt[3]) + '" width="' + (gt[1] - gt[0]) + '" height="' + (gt[3] - gt[2]) + '" rx="8"/>';
    lines += '<rect class="bt-dt bt-d2" x="' + p[0] + '" y="' + (GY - p[3]) + '" width="' + (p[1] - p[0]) + '" height="' + (p[3] - p[2]) + '" rx="4"/>';
    lines += '<rect class="bt-dt bt-d2" x="' + (cx - 30) + '" y="' + (GY - gt[3] + 12) + '" width="60" height="8" rx="4"/>';
  }
  v.lamps.forEach((l) => {
    const lz = (a, b) => closedD([V(a, l[2], 8), V(a, l[3], 8), V(b, l[3], 8), V(b, l[2], 8)]);
    lines += '<path class="bt-dt" d="' + lz(l[0], l[1]) + lz(2 * cx - l[1], 2 * cx - l[0]) + '"/>';
  });
  lines += '<path class="bt-dt" d="M' + F(cx - hw + tout + 14) + " " + (GY - Math.max(v.bumper, e.bottom + 14)) + "H" + F(cx + hw - tout - 14) + '"/>';
  lines += "</g>";
  const shadow = '<ellipse class="bt-shadow" cx="' + cx + '" cy="' + (GY + 2) + '" rx="' + F(hw * 1.2) + '" ry="14"/>' +
    [-1, 1].map((sgn) => '<ellipse class="bt-contact" cx="' + (cx + sgn * e.track) + '" cy="' + (GY + 1) + '" rx="' + F(e.tireW * 0.7) + '" ry="5"/>').join("");
  const bb = boxOf(outline.pts.concat([[cx - hw - 28, GY], [cx + hw + 28, GY + 16]]));
  const body = shadow + tires + '<path class="bt-bodyfill" d="' + outline.d + '"/>' + glass + lines;
  return { key, bb, cabin, body };
}

const BODY_IDS = ["car", "suv", "pickup", "van"];
const VIEWS = ["side", "front", "rear"];
function buildGraphics() {
  return BODY_IDS.map((id) => {
    SIDE[id].H_ = ENDS[id].H;
    const views = { side: sideView(id), front: endView(id, "front"), rear: endView(id, "rear") };
    return { id, views };
  });
}
const GRAPHICS = buildGraphics();

// The stage SVG's inner markup: shared gradients, the reflection pieces, one cabin per vehicle per
// view, then one hidden <g class="bt-body"> per vehicle per view (car Side shown first). The data-bb
// box lets 50-builder.js frame each view in the stage's safe area (spec 3.3).
function stageSvg() {
  let defs = '<defs><linearGradient id="bt-bodygrad" x1="0" y1="0" x2="0" y2="1"><stop class="bt-st-hi" offset="0"/><stop class="bt-st-lo" offset="1"/></linearGradient>' +
    '<radialGradient id="bt-glare"><stop class="bt-st-glare" offset="0"/><stop class="bt-st-glare-edge" offset="1"/></radialGradient>' +
    '<radialGradient id="bt-shadowgrad"><stop class="bt-st-sh" offset="0"/><stop class="bt-st-sh0" offset="1"/></radialGradient>';
  GRAPHICS.forEach((g) => VIEWS.forEach((v) => { defs += g.views[v].cabin; }));
  GRAPHICS.forEach((g) => { defs += '<path id="btb-' + g.id + '" d="' + g.views.side.outline + '"/>'; });
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
  const numbers = shades.rear.map((s) => s.v);
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
