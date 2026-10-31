// The Build Your Tint vehicles (05-CAR-GRAPHIC-SPEC.md, "Technical line, lit glass"), required by
// build-your-tint.11tydata.js. Four generic everyday vehicles (sedan, SUV, crew-cab pickup, minivan),
// each drawn in three views from ONE simple 3D model, so the views always agree:
//   side   orthographic, nose left, driver side (spec 2.1)
//   front  front 3/4: nose left and toward the viewer, the windshield and the driver side
//   rear   rear 3/4: tail right and toward the viewer, the back glass and the driver side
// (Chase 2026-10-31: "do 3/4 shots for front and rear too"; this reverses spec 2.5 "No 3/4".)
//
// The model. Units: overall length L = 1000, x from the front bumper to the rear, z height above the
// ground, y across the car (+y the driver side, the near side in every view). Each vehicle is one or
// two blocks (the pickup: cab and bed). A block is its side profile (the "chain": front bumper bottom,
// nose, hood, windshield, roof, back, tail, rear bumper bottom) and a half width that depends on the
// height (shoulder, tumblehome to the roof) and narrows at the ends (rounded corners in plan view).
// Every line on the car is a curve on that body: on the near side (x, z), on the top and ends
// (chain position, lateral fraction u from -1 far to +1 near), or a 3D cabin piece. Each view
// projects the same curves (yaw 32 degrees, pitch 12 degrees, mild perspective; side: straight on).
//
// Drawing order per block (painter's, far to near): wheels, the outline stroke drawn UNDER the body
// fill (so only its outer half shows: a silhouette without computing one), the fills, light and
// shade overlays, the glass, the detail lines. Windows: each its own clipped group exactly as before
// (outside light, far-pane film, the empty cabin, calibration patch, near-pane film, reflections),
// so the true-VLT film (spec 5.0) is untouched: pure black at alpha 1 - (VLT/100)^(1/2.2), nothing
// else over the glass. No badge, emblem, grille pattern, signature lamp, lettering or logo; the
// cabin is always empty. Colors are classes only (assets/v3/css/builder/50-builder.css).
"use strict";

const GY = 400;
const F = (n) => Math.round(n);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const D2R = Math.PI / 180;

// ---------- 2D helpers (screen coordinates, y down) ----------
// pathD(vertices, closed) -> { d, pts }: vertex [x, y, kind]; kind "s" smooth (Catmull-Rom), a
// number = corner radius, none = sharp. pts samples the curve.
function pathD(vs, closed) {
  const n = vs.length;
  const at = (i) => vs[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (v) => Math.hypot(v[0], v[1]) || 1;
  const info = vs.map((v, i) => {
    const prev = at(i - 1), next = at(i + 1);
    if (v[2] === "s" && (closed || (i > 0 && i < n - 1))) {
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
  // commands are collected with absolute integer points and written relative at the end (smaller)
  const cmds = [];
  const P = (p) => [F(p[0]), F(p[1])];
  const cub = (a, b, c, d) => { for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; pts.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]); } };
  const quad = (a, b, c) => { for (let k = 1; k <= 4; k++) { const t = k / 4, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]); } };
  cmds.push(["M", P(info[0].outP)]);
  pts.push(info[0].outP);
  const segs = closed ? n : n - 1;
  const seg = [];
  for (let i = 0; i < segs; i++) {
    const A = info[i], B = info[(i + 1) % n];
    const k0 = pts.length;
    const S = A.outP, E = B.inP;
    const dist = len(sub(E, S)) / 3;
    if (!A.s && !B.s) { cmds.push(["l", P(E)]); pts.push(E); }
    else {
      const c1 = A.s ? [S[0] + A.t[0] * dist, S[1] + A.t[1] * dist] : [S[0] + (E[0] - S[0]) / 3, S[1] + (E[1] - S[1]) / 3];
      const c2 = B.s ? [E[0] - B.t[0] * dist, E[1] - B.t[1] * dist] : [E[0] - (E[0] - S[0]) / 3, E[1] - (E[1] - S[1]) / 3];
      cmds.push(["c", P(c1), P(c2), P(E)]);
      cub(S, c1, c2, E);
    }
    seg.push({ curved: A.s || B.s, pts: pts.slice(k0, pts.length - 1) });
    if (!B.s && B.r > 0 && (closed || i + 1 < n - 1)) { cmds.push(["q", P(B.v), P(B.outP)]); quad(E, B.v, B.outP); }
  }
  return { d: relD(cmds) + (closed ? "z" : ""), pts, seg };
}
// write commands relative to the current point: "M10 20c1 2 3 4 5 6l-3 4" (numbers joined with a
// space, or with nothing before a minus sign); straight moves of zero length are dropped
function relD(cmds) {
  let cur = [0, 0], out = "", last = "";
  const num = (n) => String(n);
  const join = (arr) => arr.map((n, i) => (i > 0 && n >= 0 ? " " : "") + num(n)).join("");
  cmds.forEach((c) => {
    if (c[0] === "M") { out += "M" + c[1][0] + " " + c[1][1]; cur = c[1]; last = "M"; return; }
    const ps = c.slice(1);
    const end = ps[ps.length - 1];
    if (c[0] === "l" && end[0] === cur[0] && end[1] === cur[1]) return;
    const nums = [];
    ps.forEach((p) => { nums.push(p[0] - cur[0], p[1] - cur[1]); });
    const body = join(nums);
    out += (last === c[0] ? (nums[0] >= 0 ? " " : "") : c[0]) + body;
    last = c[0];
    cur = end;
  });
  return out;
}
function boxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  return { x: F(x0), y: F(y0), w: F(x1 - x0), h: F(y1 - y0) };
}
// convex hull (monotone chain), for wheels, seats and other extruded shapes
function hull(points) {
  const p = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  p.forEach((q) => { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// keep points at least `step` apart (always the first and the last)
function thin(pts, step) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], p = pts[i];
    if (Math.hypot(p[0] - a[0], p[1] - a[1]) >= step) out.push(p);
  }
  const last = pts[pts.length - 1], a = out[out.length - 1];
  if (Math.hypot(last[0] - a[0], last[1] - a[1]) < step * 0.4 && out.length > 1) out.pop();
  out.push(last);
  return out;
}
// side-coordinate vertices [x, z, kind] -> dense samples [x, z] along the same curve
function sampleSV(vs, closed, step) {
  const r = pathD(vs.map((v) => [v[0], GY - v[1], v[2]]), closed);
  return thin(r.pts.map((p) => [p[0], GY - p[1]]), step || 8);
}
// dense side-coordinate vertices that keep the original corners: each original vertex with its own
// kind, curved stretches sampled ("s"), straight stretches split into collinear points
function denseSV(vs, closed, step) {
  const r = pathD(vs.map((v) => [v[0], GY - v[1], v[2]]), closed);
  const out = [];
  const n = vs.length, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const A = vs[i], B = vs[(i + 1) % n];
    out.push([A[0], A[1], A[2]]);
    if (r.seg[i].curved) thin(r.seg[i].pts.map((p) => [p[0], GY - p[1]]), step).slice(1).forEach((p) => out.push([p[0], p[1], "s"]));
    else {
      const k = Math.floor(Math.hypot(B[0] - A[0], B[1] - A[1]) / step);
      for (let j = 1; j < k; j++) out.push([A[0] + (B[0] - A[0]) * j / k, A[1] + (B[1] - A[1]) * j / k, null]);
    }
  }
  if (!closed) out.push(vs[n - 1].slice());
  return out;
}
const smooth = (pts, closed) => pts.map((p, i) => [p[0], p[1], (!closed && (i === 0 || i === pts.length - 1)) ? undefined : "s"]);
const dOpen = (pts) => pathD(smooth(pts, false), false).d;
const dClosed = (pts) => pathD(smooth(pts, true), true).d;
function inPoly(pt, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1);
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function edgeDist(p, poly) { let m = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) m = Math.min(m, distSeg(p, poly[i], poly[j])); return m; }
// the most open spot of a polygon (grid search), away from any obstacle polygon
function openSpot(poly, avoid, prefer) {
  const b = boxOf(poly);
  let best = null, bestD = -1;
  for (let y = b.y + 4; y <= b.y + b.h - 4; y += 3) {
    for (let x = b.x + 4; x <= b.x + b.w - 4; x += 3) {
      const p = [x, y];
      if (!inPoly(p, poly)) continue;
      let d = edgeDist(p, poly);
      (avoid || []).forEach((q) => { d = inPoly(p, q) ? -1 : Math.min(d, edgeDist(p, q)); });
      if (prefer) d -= prefer(p);
      if (d > bestD) { bestD = d; best = p; }
    }
  }
  return best && bestD >= 16 ? best : null;
}

// ---------- the camera ----------
function camFor(view) {
  if (view === "side") return { th: 0, ph: 0, dist: 0, rear: false };
  return { th: 32 * D2R, ph: 6 * D2R, dist: 3400, rear: view === "rear" };
}
function projector(cam) {
  const st = Math.sin(cam.th), ct = Math.cos(cam.th), sp = Math.sin(cam.ph), cp = Math.cos(cam.ph);
  const dx = cam.rear ? -st : st, dy = -ct;
  const r = [-dy, dx], u = [dx * sp, dy * sp, cp], f = [dx * cp, dy * cp, -sp];
  return function (p) {
    const q0 = p[0] - 500, q1 = p[1], q2 = p[2] - 150;
    const x = r[0] * q0 + r[1] * q1;
    const y = u[0] * q0 + u[1] * q1 + u[2] * q2;
    const z = f[0] * q0 + f[1] * q1 + f[2] * q2;
    const s = cam.dist ? cam.dist / (cam.dist + z) : 1;
    return [500 + x * s, GY - 150 - y * s, z];
  };
}

// ---------- one block of body ----------
function interp(list, x) {
  if (x <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) if (x <= list[i][0]) { const a = list[i - 1], b = list[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  return list[list.length - 1][1];
}
function mkBlock(car, b) {
  const g = Object.assign({}, car, b);
  const dv = denseSV(b.chain, false, 11);
  const pts = dv.map((v) => [v[0], v[1]]);
  const kinds = dv.map((v) => v[2]);
  const third = Math.floor(pts.length / 3);
  let imin = 0; for (let i = 0; i < third; i++) if (pts[i][0] < pts[imin][0]) imin = i;
  let iN = imin; while (iN < pts.length - 1 && pts[iN][0] < g.noseEnd) iN++;
  let imax = pts.length - 1; for (let i = pts.length - 1; i > pts.length - third; i--) if (pts[i][0] > pts[imax][0]) imax = i;
  let iT = imax; while (iT > iN && pts[iT][0] > g.tailStart) iT--;
  const beltAt = (x) => interp(car.belt, x);
  const x0 = b.chain.reduce((m, v) => Math.min(m, v[0]), Infinity), x1 = b.chain.reduce((m, v) => Math.max(m, v[0]), -Infinity);
  function w(x, z) {
    const belt = beltAt(x);
    let v;
    if (z <= belt) {
      const t = clamp((z - g.rocker) / Math.max(1, belt - g.rocker), 0, 1);
      v = g.hw - g.tuck * (1 - t) * (1 - t);
    } else {
      const ramp = clamp((z - belt) / 14, 0, 1), t = clamp((z - belt - 14) / Math.max(1, g.H - belt - 14), 0, 1);
      v = g.hw - g.shoulderIn * ramp - (g.hw - g.shoulderIn - g.rw) * t;
    }
    if (g.noseIn && x < x0 + g.endR) v -= g.noseIn * Math.pow((x0 + g.endR - x) / g.endR, 2);
    if (g.tailIn && x > x1 - g.endR) v -= g.tailIn * Math.pow((x - (x1 - g.endR)) / g.endR, 2);
    return v;
  }
  // the nearest chain position to a side point (x, z): { x, z, i (fractional sample index) }
  function nearest(x, z) {
    let best = null, bd = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
      const px = a[0] + t * dx, pz = a[1] + t * dz, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, i: i + t }; }
    }
    return best;
  }
  const isTop = (i) => i >= iN && i <= iT;
  const onChainAt = (q, u) => [q.x, u * w(q.x, q.z), q.z + (isTop(q.i) ? g.crown * (1 - u * u) : 0)];
  const blk = {
    g, pts, kinds, iN, iT, w, beltAt,
    near: (x, z, off) => [x, w(x, z) + (off || 0), z],
    far: (x, z) => [x, -w(x, z), z],
    // a point on the top or an end: chain point nearest (x, z), lateral fraction u
    on: (x, z, u) => onChainAt(nearest(x, z), u),
    // a point on the top at chain x (top zone only)
    top: (x, u) => {
      let k = iN; while (k < imax - 1 && pts[k + 1][0] < x) k++;
      const a = pts[k], c = pts[Math.min(k + 1, pts.length - 1)];
      const t = c[0] === a[0] ? 0 : clamp((x - a[0]) / (c[0] - a[0]), 0, 1);
      const z = a[1] + (c[1] - a[1]) * t;
      return [x, u * w(x, z), z + (k <= iT ? g.crown * (1 - u * u) : 0)];
    },
    // a point on the nose (front face) or the tail (rear face) at height z
    end: (which, z, u) => {
      const lo = which === "nose" ? 0 : iT, hi = which === "nose" ? iN : pts.length - 1;
      let best = pts[lo];
      for (let k = lo; k < hi; k++) {
        const a = pts[k], c = pts[k + 1];
        if ((z - a[1]) * (z - c[1]) <= 0 && a[1] !== c[1]) { const t = (z - a[1]) / (c[1] - a[1]); best = [a[0] + (c[0] - a[0]) * t, z]; break; }
      }
      return [best[0], u * w(best[0], z), z];
    },
    // chain samples between two side points, mapped at lateral fraction u
    range: (xa, za, xb, zb, u) => {
      const A = nearest(xa, za), B = nearest(xb, zb);
      const out = [onChainAt(A, u)];
      const s = Math.sign(B.i - A.i) || 1;
      for (let k = s > 0 ? Math.ceil(A.i) : Math.floor(A.i); s > 0 ? k < B.i : k > B.i; k += s) out.push(onChainAt({ x: pts[k][0], z: pts[k][1], i: k }, u));
      out.push(onChainAt(B, u));
      return out;
    }
  };
  // the full side outline of the block: chain, then the bottom with its wheel arches (rear to front)
  const bottom = [];
  const last = b.chain[b.chain.length - 1], first = b.chain[0];
  const arches = (b.arches || []).slice().sort((p, q) => q - p);
  bottom.push([last[0], last[1]]);
  arches.forEach((ax) => {
    const R = g.R, rk = g.archZ || g.rocker, dx = Math.sqrt(Math.max(0, R * R - Math.pow(g.r - rk, 2)));
    const a0 = Math.atan2(rk - g.r, dx), a1 = Math.PI - a0;
    bottom.push([ax + dx, rk]);
    for (let k = 1; k < 14; k++) { const a = a0 + (a1 - a0) * k / 14; bottom.push([ax + R * Math.cos(a), g.r + R * Math.sin(a), "s"]); }
    bottom.push([ax - dx, rk]);
  });
  bottom.push([first[0], first[1]]);
  blk.outlineSV = b.chain.concat(bottom.slice(1, -1));
  blk.bottomSV = bottom;
  return blk;
}

// ---------- the four vehicles ----------
// Proportions per spec 3 (L = 1000): wheelbase, overhangs, tire diameter (2r), ground gap (rocker),
// belt line, plus widths: hw half width at the shoulder, rw at the roof (tumblehome).
const CARS = {
  car: {
    H: 293, r: 70, R: 79, rocker: 30, rimK: 0.64, tw: 46, fx: 205, rx: 785,
    hw: 188, rw: 132, shoulderIn: 13, tuck: 9, endR: 120, noseIn: 36, tailIn: 30, crown: 5,
    belt: [[300, 186], [560, 193], [830, 203]],
    blocks: [{
      noseEnd: 14, tailStart: 976, arches: [205, 785],
      chain: [[40, 30, 10], [9, 40, 8], [0, 66, "s"], [3, 99, "s"], [14, 118, 10], [80, 134, "s"], [200, 153, "s"], [318, 175, 14],
        [398, 226, "s"], [462, 270, "s"], [560, 292, "s"], [650, 287, "s"], [732, 258, "s"], [800, 218, "s"], [846, 205, "s"],
        [930, 200, "s"], [976, 197, 8], [992, 186, 10], [1000, 150, "s"], [996, 98, "s"], [984, 46, 10], [956, 31]]
    }],
    ws: [326, 458], back: [676, 822], wsU: 0.9, backU: 0.8,
    glass: {
      front: [{ x0: 300, x1: 562, inset: 17, front: "chain", rear: 562 }],
      rear: [{ x0: 578, x1: 860, inset: 17, front: 578, rear: "chain" }]
    },
    sliverWs: [326, 458, 5, 13, 186], sliverBack: [676, 832, 5, 13, 204],
    seams: [
      [[328, 185, "s"], [316, 140, "s"], [314, 96, "s"], [320, 33]],
      [[571, 191], [573, 33]],
      [[750, 199, "s"], [742, 172, "s"], [716, 146, "s"], [704, 112, "s"], [702, 33]]
    ],
    hood: { x0: 22, x1: 314, u: 0.84 },
    crease: [[104, 129, "s"], [330, 166, "s"], [620, 175, "s"], [980, 183, "s"]],
    lower: [[296, 86, "s"], [500, 90, "s"], [700, 98, "s"]],
    sill: [292, 698, 46],
    bumperSide: [[[90, 120, "s"], [112, 98, "s"], [118, 62, "s"], [112, 36]], [[878, 32, "s"], [882, 74, "s"], [900, 116, "s"], [936, 132, "s"], [996, 128]]],
    fuel: [856, 168],
    handles: [[470, 172], [692, 176]],
    mirror: [[338, 190], [326, 207], [360, 211], [372, 193]],
    lampSide: { head: [[6, 101, 5], [12, 116, 5], [96, 133, 6], [88, 119, 6]], tail: [[952, 192, 6], [991, 182, 6], [996, 160, 6], [960, 172, 6]] },
    face: {
      head: [[0.5, 98, 6], [0.54, 111, 6], [0.95, 116, 7], [0.98, 100, 6]],
      grille: [[-0.4, 82, 12], [-0.4, 108, 12], [0.4, 108, 12], [0.4, 82, 12]], bar: 95,
      intake: [[-0.56, 42, 10], [-0.6, 64, 10], [0.6, 64, 10], [0.56, 42, 10]],
      fog: [[0.7, 46, 5], [0.7, 58, 5], [0.88, 60, 5], [0.9, 46, 5]],
      plate: [-0.19, 0.19, 66, 79], lines: [[-0.82, 36, 0.82, 36]]
    },
    rearFace: {
      tail: [[0.56, 162, 6], [0.56, 186, 6], [0.97, 190, 7], [0.99, 166, 6]],
      lid: { top: [830, 970], u: 0.86, low: 128, inner: 0.56 },
      plate: [-0.21, 0.21, 134, 156], lines: [[-0.98, 118, 0.98, 118], [-0.7, 50, 0.7, 50]],
      refl: [[0.78, 62, 4], [0.78, 70, 4], [0.93, 70, 4], [0.93, 62, 4]]
    },
    cab: {
      floor: 50, dash: [300, 392, 196], wheel: [402, 208, 30],
      seats: [
        { x: 498, z0: 168, h: 84, lean: 16, th: 34, y: [0.12, 0.82], head: [7, 27, 30, 0.42] },
        { x: 498, z0: 168, h: 84, lean: 16, th: 34, y: [-0.82, -0.12], head: [7, 27, 30, 0.42] },
        { x: 700, z0: 172, h: 76, lean: 8, th: 40, y: [-0.86, 0.86], heads: [[0.52, 6, 24, 28, 0.36], [-0.52, 6, 24, 28, 0.36]] }
      ],
      rear: [744, 830, 198], ghX: [318, 832]
    },
    width: 376
  },
  suv: {
    H: 356, r: 82, R: 93, rocker: 44, rimK: 0.62, tw: 52, fx: 200, rx: 790,
    hw: 202, rw: 164, shoulderIn: 10, tuck: 8, endR: 100, noseIn: 28, tailIn: 22, crown: 4,
    belt: [[300, 222], [580, 228], [930, 240]],
    blocks: [{
      noseEnd: 12, tailStart: 950, arches: [200, 790],
      chain: [[34, 46, 10], [6, 58, 8], [0, 98, "s"], [4, 150, "s"], [12, 184, 10], [80, 198, "s"], [190, 211, "s"], [292, 224, 14],
        [356, 282, "s"], [418, 330, "s"], [474, 348, "s"], [600, 356, "s"], [800, 356, "s"], [902, 351, "s"], [946, 342, 10],
        [968, 322, "s"], [986, 270, "s"], [994, 222, "s"], [1000, 142, "s"], [996, 82, "s"], [986, 57, 10], [960, 44]]
    }],
    ws: [300, 466], back: [952, 992], wsU: 0.9, backU: 0.8,
    glass: {
      front: [{ x0: 290, x1: 566, inset: 16, front: "chain", rear: 566 }],
      rear: [{ x0: 582, x1: 722, inset: 16, front: 582, rear: 722 }, { x0: 740, x1: 940, inset: 16, front: 740, rear: [[892, 340, "s"], [918, 300, "s"], [928, 250, 6]] }]
    },
    sliverWs: [300, 466, 5, 13, 228], sliverBack: [952, 990, 4, 12, 244],
    seams: [
      [[320, 226, "s"], [306, 160, "s"], [304, 110, "s"], [312, 47]],
      [[574, 227], [576, 47]],
      [[732, 232, "s"], [730, 200, "s"], [716, 172, "s"], [696, 144, "s"], [688, 104, "s"], [690, 47]]
    ],
    hood: { x0: 20, x1: 288, u: 0.86 },
    crease: [[96, 194, "s"], [400, 204, "s"], [700, 212, "s"], [968, 226, "s"]],
    lower: [[312, 100, "s"], [520, 106, "s"], [690, 114, "s"]],
    sill: [306, 684, 62], cladding: 12, cladLine: 74,
    bumperSide: [[[94, 176, "s"], [118, 150, "s"], [120, 96, "s"], [110, 50]], [[896, 46, "s"], [900, 96, "s"], [920, 128, "s"], [998, 128]]],
    fuel: [858, 200],
    handles: [[476, 210], [664, 214]],
    mirror: [[352, 228], [340, 248], [376, 251], [388, 232]],
    rails: { x0: 486, x1: 900, u: 0.82, h: 6 },
    lampSide: { head: [[6, 166, 5], [10, 182, 5], [102, 196, 6], [96, 180, 6]], tail: [[958, 334, 6], [984, 272, 6], [990, 244, 6], [972, 290, 6]] },
    face: {
      head: [[0.48, 162, 6], [0.5, 178, 6], [0.95, 182, 7], [0.98, 164, 6]],
      grille: [[-0.42, 136, 14], [-0.42, 170, 14], [0.42, 170, 14], [0.42, 136, 14]], bar: 152,
      intake: [[-0.58, 66, 12], [-0.62, 110, 12], [0.62, 110, 12], [0.58, 66, 12]],
      fog: [[0.72, 74, 5], [0.72, 90, 5], [0.9, 92, 5], [0.92, 74, 5]],
      plate: [-0.2, 0.2, 114, 132], lines: [[-0.5, 54, 0.5, 54], [-0.9, 120, -0.68, 122], [0.68, 122, 0.9, 120]]
    },
    rearFace: {
      tail: [[0.6, 204, 6], [0.62, 262, 6], [0.97, 268, 7], [0.99, 206, 6]],
      gate: { topX: 944, u: 0.9, low: 120, inner: 0.6, glassBase: 250 },
      plate: [-0.22, 0.22, 142, 170], lines: [[-0.99, 116, 0.99, 116], [-0.6, 70, 0.6, 70], [-0.5, 54, 0.5, 54]],
      refl: [[0.74, 84, 4], [0.74, 92, 4], [0.92, 92, 4], [0.92, 84, 4]], spoiler: [946, 340]
    },
    cab: {
      floor: 64, dash: [282, 368, 234], wheel: [380, 246, 32],
      seats: [
        { x: 494, z0: 206, h: 94, lean: 14, th: 36, y: [0.12, 0.8], head: [8, 30, 32, 0.42] },
        { x: 494, z0: 206, h: 94, lean: 14, th: 36, y: [-0.8, -0.12], head: [8, 30, 32, 0.42] },
        { x: 690, z0: 210, h: 88, lean: 6, th: 42, y: [-0.86, 0.86], heads: [[0.52, 7, 28, 30, 0.36], [-0.52, 7, 28, 30, 0.36]] }
      ],
      rear: [736, 984, 236], ghX: [292, 944]
    },
    width: 405
  },
  pickup: {
    H: 333, r: 72, R: 83, rocker: 40, rimK: 0.6, tw: 54, fx: 170, rx: 788,
    hw: 172, rw: 146, shoulderIn: 8, tuck: 6, endR: 70, noseIn: 18, tailIn: 6, crown: 4,
    belt: [[300, 233], [520, 236], [660, 238]],
    blocks: [{
      id: "cab", noseEnd: 9, tailStart: 655, arches: [170],
      chain: [[30, 44, 12], [6, 62, 8], [0, 110, "s"], [2, 170, "s"], [8, 205, 8], [70, 217, "s"], [220, 228, "s"], [300, 235, 14],
        [350, 276, "s"], [404, 318, "s"], [452, 330, "s"], [560, 334, "s"], [640, 332, "s"], [656, 326, 8], [664, 300, "s"], [668, 262, "s"],
        [670, 200, "s"], [670, 44]]
    }, {
      id: "bed", noseEnd: 683, tailStart: 994, arches: [788], noseIn: 0, tailIn: 6, endR: 40, archZ: 52,
      chain: [[682, 52], [682, 226, 3], [996, 226, 4], [999, 206, "s"], [999, 114, 4], [1004, 109, 3], [1004, 64, 6], [994, 52]]
    }],
    ws: [306, 444], back: null, wsU: 0.9,
    backFace: { z: [250, 312], u: 0.56 },
    glass: {
      front: [{ x0: 290, x1: 500, inset: 15, front: "chain", rear: 500 }],
      rear: [{ x0: 514, x1: 652, inset: 15, front: 514, rear: [[634, 318, "s"], [648, 304, "s"], [652, 242, 6]] }]
    },
    sliverWs: [306, 444, 5, 13, 236], backQuad: [[658, 250, 3], [661, 312, 3], [668, 312, 3], [666, 250, 3]],
    seams: [
      [[294, 228, "s"], [284, 150, "s"], [284, 100, "s"], [290, 42]],
      [[507, 236], [509, 42]],
      [[662, 236, "s"], [662, 120, "s"], [664, 42]],
      [[690, 214], [990, 214]], [[690, 196, "s"], [840, 197, "s"], [990, 198, "s"]]
    ],
    hood: { x0: 16, x1: 296, u: 0.84 },
    crease: [[30, 199, "s"], [300, 212, "s"], [660, 216, "s"]],
    lower: [[300, 108, "s"], [480, 112, "s"], [650, 116, "s"]],
    sill: [258, 664, 56],
    step: [262, 664, 44, 54],
    bumperSide: [[[70, 112, "s"], [80, 70, "s"], [74, 44]]],
    fuel: [722, 168],
    handles: [[440, 216], [598, 216]],
    mirror: [[338, 236], [322, 266], [370, 270], [386, 240]],
    lampSide: { head: [[6, 194, 6], [60, 206, "s"], [80, 201, 6], [12, 176, 6]], tail: [[988, 218, 3], [999, 218, 3], [999, 160, 3], [988, 160, 3]] },
    face: {
      head: [[0.64, 160, 6], [0.64, 192, 6], [0.97, 196, 6], [0.98, 162, 6]],
      grille: [[-0.6, 108, 14], [-0.6, 188, 14], [0.6, 188, 14], [0.6, 108, 14]], bar: 148,
      intake: [[-0.98, 54, 8], [-0.99, 98, 8], [0.99, 98, 8], [0.98, 54, 8]],
      plate: [-0.2, 0.2, 64, 86], lines: [[-0.9, 104, 0.9, 104]]
    },
    rearFace: {
      tail: [[0.9, 152, 3], [0.9, 216, 3], [0.995, 216, 3], [0.995, 152, 3]],
      tailgate: [-0.86, 0.86, 118, 218], handle: [-0.12, 0.12, 200, 208],
      bumper: [-0.99, 0.99, 60, 108], step: [-0.24, 0.24, 98, 104], plate: [-0.2, 0.2, 70, 92]
    },
    bed: { floor: 70, inset: 10 },
    cab: {
      floor: 60, dash: [290, 372, 244], wheel: [384, 256, 32],
      seats: [
        { x: 458, z0: 200, h: 92, lean: 12, th: 36, y: [0.12, 0.82], head: [8, 28, 30, 0.42] },
        { x: 458, z0: 200, h: 92, lean: 12, th: 36, y: [-0.82, -0.12], head: [8, 28, 30, 0.42] },
        { x: 606, z0: 202, h: 86, lean: 3, th: 36, y: [-0.86, 0.86], heads: [[0.52, 7, 24, 28, 0.36], [-0.52, 7, 24, 28, 0.36]] }
      ],
      rear: [646, 664, 250], ghX: [300, 660]
    },
    width: 345
  },
  van: {
    H: 340, r: 72, R: 81, rocker: 32, rimK: 0.62, tw: 48, fx: 200, rx: 795,
    hw: 195, rw: 168, shoulderIn: 9, tuck: 8, endR: 110, noseIn: 32, tailIn: 18, crown: 4,
    belt: [[230, 189], [700, 197], [958, 204]],
    blocks: [{
      noseEnd: 16, tailStart: 964, arches: [200, 795],
      chain: [[30, 32, 10], [6, 46, 8], [0, 84, "s"], [4, 120, "s"], [16, 142, 10], [80, 160, "s"], [176, 183, 12],
        [260, 244, "s"], [350, 304, "s"], [424, 331, "s"], [490, 338, "s"], [820, 340, "s"], [930, 334, "s"], [964, 320, 12],
        [984, 252, "s"], [994, 190, "s"], [1000, 120, "s"], [992, 52, 10], [966, 33]]
    }],
    ws: [184, 420], back: [968, 990], wsU: 0.9, backU: 0.82,
    glass: {
      front: [{ x0: 200, x1: 452, inset: 15, front: "chain", rear: 452 }],
      rear: [{ x0: 468, x1: 690, inset: 15, front: 468, rear: 690 }, { x0: 706, x1: 960, inset: 15, front: 706, rear: [[930, 322, "s"], [952, 292, "s"], [958, 210, 6]] }]
    },
    sliverWs: [184, 420, 5, 13, 190], sliverBack: [968, 994, 4, 12, 212],
    seams: [
      [[232, 189, "s"], [246, 160, "s"], [272, 130, "s"], [286, 90, "s"], [288, 33]],
      [[460, 190], [462, 33]],
      [[698, 192], [700, 33]]
    ],
    track: [[700, 186, "s"], [820, 187, "s"], [956, 192, "s"]],
    hood: { x0: 24, x1: 172, u: 0.84 },
    crease: [[60, 150, "s"], [300, 174, "s"], [700, 180, "s"], [985, 184, "s"]],
    lower: [[290, 80, "s"], [500, 86, "s"], [718, 92, "s"]],
    sill: [278, 712, 46],
    bumperSide: [[[96, 140, "s"], [118, 112, "s"], [122, 66, "s"], [116, 34]], [[880, 33, "s"], [884, 70, "s"], [904, 104, "s"], [996, 106]]],
    fuel: [872, 150],
    handles: [[396, 180], [492, 180]],
    mirror: [[250, 193], [238, 213], [272, 216], [284, 197]],
    lampSide: { head: [[6, 114, 5], [10, 130, 5], [98, 154, 6], [92, 138, 6]], tail: [[964, 304, 6], [984, 246, 6], [990, 214, 6], [972, 264, 6]] },
    face: {
      head: [[0.48, 116, 6], [0.52, 134, 6], [0.95, 140, 7], [0.98, 118, 6]],
      grille: [[-0.4, 98, 12], [-0.4, 124, 12], [0.4, 124, 12], [0.4, 98, 12]], bar: 111,
      intake: [[-0.56, 44, 10], [-0.6, 74, 10], [0.6, 74, 10], [0.56, 44, 10]],
      fog: [[0.72, 50, 5], [0.72, 62, 5], [0.9, 64, 5], [0.92, 50, 5]],
      plate: [-0.2, 0.2, 78, 94], lines: [[-0.84, 38, 0.84, 38]]
    },
    rearFace: {
      tail: [[0.8, 196, 6], [0.84, 300, 6], [0.98, 304, 6], [0.99, 198, 6]],
      gate: { topX: 962, u: 0.92, low: 104, inner: 0.78, glassBase: 214 },
      plate: [-0.22, 0.22, 128, 156], lines: [[-0.99, 100, 0.99, 100], [-0.7, 52, 0.7, 52]],
      refl: [[0.76, 64, 4], [0.76, 72, 4], [0.92, 72, 4], [0.92, 64, 4]], spoiler: [964, 318]
    },
    cab: {
      floor: 50, dash: [170, 262, 202], wheel: [300, 212, 32],
      seats: [
        { x: 392, z0: 174, h: 92, lean: 12, th: 36, y: [0.12, 0.8], head: [8, 30, 30, 0.42] },
        { x: 392, z0: 174, h: 92, lean: 12, th: 36, y: [-0.8, -0.12], head: [8, 30, 30, 0.42] },
        { x: 600, z0: 178, h: 88, lean: 8, th: 34, y: [0.14, 0.78], head: [7, 26, 28, 0.42] },
        { x: 600, z0: 178, h: 88, lean: 8, th: 34, y: [-0.78, -0.14], head: [7, 26, 28, 0.42] },
        { x: 806, z0: 182, h: 84, lean: 6, th: 38, y: [-0.86, 0.86], heads: [[0.52, 6, 24, 28, 0.34], [-0.52, 6, 24, 28, 0.34]] }
      ],
      rear: [850, 984, 210], ghX: [176, 962]
    },
    width: 390
  }
};

// ---------- markup pieces ----------
function streaks(b, lean) {
  // two parallel diagonal streaks leaning back about 20 degrees (spec 5.5)
  const sh = F(b.h * 0.36) * (lean || 1);
  const one = (cx, w) => { const x0 = F(b.x + b.w * cx - sh / 2); return "M" + x0 + " " + (b.y + b.h + 4) + "h" + F(w) + "l" + sh + " " + -(b.h + 8) + "h" + -F(w) + "Z"; };
  return { wide: one(0.36, Math.max(4, b.w * 0.14)), thin: one(0.6, Math.max(2, b.w * 0.04)) };
}
const cal = (x, y, s) => '<rect class="bt-cal" x="' + F(x) + '" y="' + F(y) + '" width="' + (s || 20) + '" height="' + (s || 20) + '"/>';
// One window: kind "win" (data-win) or "addon" (data-addon). subs: screen vertex lists.
// opt: { far, cabin, cal: [x, y], thin, lean, strip: screen vertex list (the top-strip film band) }
function panelMarkup(key, kind, id, subs, opt) {
  const all = [], boxes = [];
  const d = subs.map((s) => { const r = pathD(s, true); all.push.apply(all, r.pts); boxes.push(boxOf(r.pts)); return r.d; }).join("");
  const b = boxOf(all);
  const g = "btg-" + key, c = "btc-" + key, t = "btt-" + key;
  const pad = 6;
  const R = (cls, extra) => '<rect class="' + cls + '" x="' + (b.x - pad) + '" y="' + (b.y - pad) + '" width="' + (b.w + 2 * pad) + '" height="' + (b.h + 2 * pad) + '"' + (extra || "") + "/>";
  const st = { wide: "", thin: "" };
  boxes.forEach((bx) => { const one = streaks(bx, opt.lean); st.wide += one.wide; st.thin += one.thin; });
  let s = "<defs>" + '<path id="' + g + '" d="' + d + '"/>' + '<clipPath id="' + c + '"><use href="#' + g + '"/></clipPath>' +
    '<clipPath id="' + t + '"><rect x="' + (b.x - pad) + '" y="' + (b.y - pad) + '" width="' + (b.w + 2 * pad) + '" height="' + F(Math.max(8, b.h * 0.18) + pad) + '"/></clipPath></defs>';
  const attr = kind === "win" ? ' class="bt-win" data-win="' + id + '"' : ' class="bt-win bt-add" data-addon="' + id + '"';
  s += "<g" + attr + ">";
  s += '<g clip-path="url(#' + c + ')">' + R("bt-win__base") + R("bt-win__outside");
  if (opt.far) s += R("bt-win__far", ' data-far="' + opt.far + '"');
  s += '<use class="bt-win__cabin" href="#' + opt.cabin + '"/>';
  // the calibration patch for the transmission test (spec 9 item 11), above the far pane and the
  // cabin, under the near pane, drawn in the panel itself so the test attribute reaches it
  if (opt.cal) s += cal(opt.cal[0], opt.cal[1]);
  s += R("bt-win__tint", ' data-tint="' + id + '"');
  // the windshield top strip film sits inside the windshield's own clip (a filmed full windshield
  // switches the strip off in 50-builder.js, so the two never stack)
  if (opt.strip) s += '<path class="bt-win__tint bt-win__strip" data-tint="top-strip" d="' + pathD(opt.strip, true).d + '"/>';
  // stroked copies are real paths, not <use>: vector-effect is not inherited through <use>
  const sp = (cls, extra) => '<path class="' + cls + '" d="' + d + '"' + (extra || "") + "/>";
  s += '<g class="bt-refl">' + R("bt-refl__veil") + '<path class="bt-refl__wide" d="' + st.wide + '"/><path class="bt-refl__thin" d="' + st.thin + '"/>' +
    '<use class="bt-refl__top" href="#' + g + '" clip-path="url(#' + t + ')"/>' + "</g>";
  s += "</g>";
  s += sp("bt-win__edge");
  if (opt.thin) s += sp("bt-win__hit");
  s += "</g>";
  return { markup: s, box: b, pts: all };
}
// the strip add-on's own group: no glass of its own (it is film on the windshield), just the tap
// area, its edge and the selection ring
function stripMarkup(vs) {
  const d = pathD(vs, true).d;
  return '<g class="bt-win bt-add bt-strip" data-addon="top-strip"><path class="bt-strip__hit" d="' + d + '"/><path class="bt-win__edge bt-strip__edge" d="' + d +
    '"/></g>';
}

// ---------- one vehicle in one view ----------
function vehicleView(id, view) {
  const c = CARS[id];
  const cam = camFor(view), P3 = projector(cam);
  const P = (p) => { const q = P3(p); return [q[0], q[1]]; };
  const depth = (p) => P3(p)[2];
  const side = view === "side";
  const key = id + "-" + view;
  const blocks = c.blocks.map((b) => mkBlock(c, b));
  const main = blocks[0];
  // screen vertex list from 3D points with kinds
  const sv = (pts3, kinds) => pts3.map((p, i) => { const q = P(p); return [q[0], q[1], typeof kinds === "function" ? kinds(i) : kinds]; });
  const openOf = (pts3) => dOpen(pts3.map(P));
  const closedOf = (pts3) => dClosed(pts3.map(P));
  const kindsClosedOf = (pts3, kinds) => pathD(pts3.map((p, i) => { const q = P(p); return [q[0], q[1], kinds[i]]; }), true).d;
  // a near-side curve given in side coordinates -> open path
  const sideLine = (blk, vs, off) => openOf(sampleSV(vs, false, 14).map((p) => blk.near(p[0], p[1], off)));
  // a small closed near-side shape given in side coordinates with corner kinds
  const sideShape = (blk, vs, off) => pathD(vs.map((v) => { const q = P(blk.near(v[0], v[1], off || 0.5)); return [q[0], q[1], v[2]]; }), true).d;
  const L = { lines: "", d2: "" };
  const add = (cls, d) => '<path class="' + cls + '" d="' + d + '"/>';

  // which end faces the viewer
  const showNose = view === "front", showTail = view === "rear";
  // blocks in painter's order (far first): the pickup bed sits behind the cab in Front 3/4
  const order = blocks.slice();
  if (blocks.length > 1) order.sort((a, b2) => depth([ (b2.g.chain[0][0] + b2.g.chain[b2.g.chain.length - 1][0]) / 2, 0, 100]) - depth([(a.g.chain[0][0] + a.g.chain[a.g.chain.length - 1][0]) / 2, 0, 100]));

  // ----- the cabin seen through the glass (one group per vehicle per view) -----
  const cabKey = "btcab-" + key;
  const cb = c.cab;
  const wIn = (x, z) => main.w(x, z) - 14;
  const pieces = [];
  const piece = (dep, markup) => pieces.push({ dep, markup });
  // far greenhouse: the far side above the belt, dark, with the far windows cut out (the outside
  // light and the far-pane film show through those holes)
  const ghPts = main.pts.filter((p) => p[0] >= cb.ghX[0] && p[0] <= cb.ghX[1] && p[1] > main.beltAt(p[0]) - 2);
  const env = ghPts.map((p) => main.far(p[0], p[1] - 2)).concat([main.far(cb.ghX[1], main.beltAt(cb.ghX[1]) - 4), main.far(cb.ghX[0], main.beltAt(cb.ghX[0]) - 4)]);
  const glassSV = {}; // window id -> list of side vertex lists
  ["front", "rear"].forEach((w) => { glassSV[w] = c.glass[w].map((spec) => dlo(main, spec)); });
  let ghD = closedOf(env);
  ["front", "rear"].forEach((w) => glassSV[w].forEach((vs) => { ghD += pathD(vs.map((v) => { const q = P(main.far(v[0], v[1])); return [q[0], q[1], v[2]]; }), true).d; }));
  let cabin = '<g id="' + cabKey + '">';
  // floor and far door trim (inner door panel top a little above the belt) with its sill line
  const fl = cb.floor, gx0 = cb.ghX[0] + 10, gx1 = cb.ghX[1] - 6;
  cabin += add("bt-cab__trim", closedOf([[gx0, -wIn(gx0, fl), fl], [gx1, -wIn(gx1, fl), fl], [gx1, wIn(gx1, fl), fl], [gx0, wIn(gx0, fl), fl]]));
  cabin += '<path class="bt-cab__gh" d="' + ghD + '"/>';
  const trimTop = [];
  for (let x = gx0; x <= gx1; x += (gx1 - gx0) / 12) trimTop.push([x, -wIn(x, main.beltAt(x)), main.beltAt(x) + 14]);
  cabin += add("bt-cab__trim", closedOf(trimTop.concat([[gx1, -wIn(gx1, fl), fl], [gx0, -wIn(gx0, fl), fl]])));
  cabin += add("bt-cab__sill", openOf(trimTop));
  // a box (dash, rear shelf or cargo floor), drawn as the hull of its corners
  const box = (x0, x1, z0, z1, wf) => {
    const corners = [];
    [x0, x1].forEach((x) => [z0, z1].forEach((z) => [-1, 1].forEach((sg) => corners.push(P([x, sg * (wf ? wf(x, z) : wIn(x, z)), z])))));
    return dClosed(hull(corners));
  };
  const dsh = cb.dash;
  piece(depth([(dsh[0] + dsh[1]) / 2, 0, dsh[2]]), add("bt-cab__trim", box(dsh[0], dsh[1], dsh[2] - 46, dsh[2])) +
    add("bt-cab__sill", openOf([[dsh[1], -wIn(dsh[1], dsh[2]), dsh[2]], [dsh[1], wIn(dsh[1], dsh[2]), dsh[2]]])));
  const rr = cb.rear;
  piece(depth([(rr[0] + rr[1]) / 2, 0, rr[2]]), add("bt-cab__trim", box(rr[0], rr[1], fl, rr[2])));
  // seats: a reclined seat-back profile extruded across, a flat wide headrest on two posts (furniture,
  // never a figure: the headrest is wider than tall and the back has square shoulders)
  cb.seats.forEach((st) => {
    const hw = c.hw;
    const y0 = st.y[0] * hw, y1 = st.y[1] * hw;
    const prof = sampleSV([[st.x, st.z0, 4], [st.x + st.lean * 0.55, st.z0 + st.h * 0.5, "s"], [st.x + st.lean - 1, st.z0 + st.h - 5, "s"], [st.x + st.lean + st.th * 0.45, st.z0 + st.h, "s"],
      [st.x + st.lean + st.th + 1, st.z0 + st.h - 7, "s"], [st.x + st.th + st.lean * 0.5, st.z0 + st.h * 0.5, "s"], [st.x + st.th + 2, st.z0, 4]], true, 6);
    let m = add("bt-seat", dClosed(hull(prof.map((p) => P([p[0], y0, p[1]])).concat(prof.map((p) => P([p[0], y1, p[1]]))))));
    const topEdge = prof.filter((p) => p[1] > st.z0 + st.h * 0.82).sort((a, b2) => a[0] - b2[0]);
    if (topEdge.length > 1) m += add("bt-seat__rim", openOf(topEdge.map((p) => [p[0], Math.max(y0, y1), p[1]])));
    const heads = st.heads || [[(st.y[0] + st.y[1]) / 2].concat(st.head)];
    heads.forEach((h) => {
      const yc = h[0] * hw, gap = h[1], hh = h[2], dp = h[3], wh = h[4] * hw;
      const hx = st.x + st.lean + st.th * 0.1, hb = st.z0 + st.h + gap, ht = hb + hh;
      const hp = sampleSV([[hx, hb, 5], [hx - 2, ht - 6, "s"], [hx + dp * 0.45, ht, "s"], [hx + dp + 2, ht - 7, "s"], [hx + dp, hb, 5]], true, 5);
      m += add("bt-seat__post", openOf([[hx + dp * 0.5, yc - wh * 0.28, st.z0 + st.h - 2], [hx + dp * 0.5, yc - wh * 0.28, hb + 1]]) + openOf([[hx + dp * 0.5, yc + wh * 0.28, st.z0 + st.h - 2], [hx + dp * 0.5, yc + wh * 0.28, hb + 1]]));
      m += add("bt-seat", dClosed(hull(hp.map((p) => P([p[0], yc - wh / 2, p[1]])).concat(hp.map((p) => P([p[0], yc + wh / 2, p[1]]))))));
      const he = hp.filter((p) => p[1] > ht - 9).sort((a, b2) => a[0] - b2[0]);
      if (he.length > 1) m += add("bt-seat__rim", openOf(he.map((p) => [p[0], yc + wh / 2, p[1]])));
    });
    piece(depth([st.x + st.th / 2, (y0 + y1) / 2, st.z0 + st.h / 2]), m);
  });
  // steering wheel on the driver side (the near side): a ring square to a column tilted 25 degrees
  const wl = cb.wheel, yw = 0.47 * c.hw, a25 = 25 * D2R;
  const ring = [];
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; ring.push([wl[0] - Math.sin(a25) * wl[2] * Math.sin(a), yw + wl[2] * Math.cos(a), wl[1] + Math.cos(a25) * wl[2] * Math.sin(a)]); }
  piece(depth([wl[0], yw, wl[1]]), add("bt-cab__wheel", closedOf(ring)));
  pieces.sort((a, b2) => b2.dep - a.dep).forEach((p) => { cabin += p.markup; });
  cabin += "</g>";

  // ----- the glass -----
  const glassMarkup = [];
  const panels = {}; // id -> screen polygons (for the calibration spot)
  const sideGlass = (w) => glassSV[w].map((vs) => vs.map((v) => { const q = P(main.near(v[0], v[1], 0.5)); return [q[0], q[1], v[2]]; }));
  const obstacles = [];
  // the near mirror sits over the front door glass in the 3/4 views: keep the patch off it
  const mirrorPts = mirrorHull(P, main, c, true);
  obstacles.push(mirrorPts);
  const calFor = (subs, extraAvoid) => {
    let best = null;
    subs.forEach((s) => {
      const poly = pathD(s, true).pts;
      const spot = openSpot(poly, obstacles.concat(extraAvoid || []));
      if (spot && !best) best = spot;
    });
    return best ? [best[0] - 10, best[1] - 10] : null;
  };
  ["front", "rear"].forEach((w) => {
    const subs = sideGlass(w);
    panels[w] = subs;
    glassMarkup.push(panelMarkup(key + "-" + w, "win", w, subs, { far: w, cabin: cabKey, cal: calFor(subs) }).markup);
  });
  // windshield and back glass: slivers in Side (edge on, 24px tap stroke), full panels in 3/4
  const chainScreen = main.pts.map((p) => P(main.near(p[0], p[1])));
  if (side) {
    const sl = (spec) => sliverSV(main, spec).map((v) => { const q = P(main.near(v[0], v[1])); return [q[0], q[1], v[2]]; });
    glassMarkup.unshift(panelMarkup(key + "-windshield", "win", "windshield", [sl(c.sliverWs)], { far: "back", cabin: cabKey, thin: true }).markup);
    const backSV = c.backQuad ? c.backQuad.map((v) => { const q = P(main.near(v[0], v[1])); return [q[0], q[1], v[2]]; }) : sl(c.sliverBack);
    glassMarkup.push(panelMarkup(key + "-back", "win", "back", [backSV], { far: "windshield", cabin: cabKey, thin: true }).markup);
  }
  const topGlass = (blk, x0, x1, u0, u1, r) => {
    // a glass outline on the top surface between chain x0 and x1, lateral fraction u0 at x0, u1 at x1
    const out = [];
    const nU = 8, nX = 6;
    for (let k = 0; k <= nU; k++) { const u = -u0 + 2 * u0 * k / nU; out.push([blk.top(x0, u), k === 0 || k === nU ? r : "s"]); }
    for (let k = 1; k < nX; k++) { const x = x0 + (x1 - x0) * k / nX, u = u0 + (u1 - u0) * k / nX; out.push([blk.top(x, u), "s"]); }
    for (let k = 0; k <= nU; k++) { const u = u1 - 2 * u1 * k / nU; out.push([blk.top(x1, u), k === 0 || k === nU ? r : "s"]); }
    for (let k = 1; k < nX; k++) { const x = x1 - (x1 - x0) * k / nX, u = -(u1 + (u0 - u1) * k / nX); out.push([blk.top(x, u), "s"]); }
    return out.map((e) => { const q = P(e[0]); return [q[0], q[1], e[1]]; });
  };
  if (view === "front") {
    const ws = topGlass(main, c.ws[0], c.ws[1], c.wsU, c.wsU - 0.04, 9);
    const sx = c.ws[1] - (c.ws[1] - c.ws[0]) * 0.16;
    const strip = topGlass(main, sx, c.ws[1], c.wsU - 0.03, c.wsU - 0.04, 9);
    const stripPoly = pathD(strip, true).pts;
    glassMarkup.unshift(stripMarkup(strip));
    glassMarkup.unshift(panelMarkup(key + "-windshield", "win", "windshield", [ws], { far: "back", cabin: cabKey, strip, cal: calFor([ws], [stripPoly]) }).markup);
    // keep the windshield first so the strip's tap area sits above it
    const wsM = glassMarkup.shift(), stM = glassMarkup.shift();
    glassMarkup.unshift(stM); glassMarkup.unshift(wsM);
  }
  if (view === "rear") {
    let bg;
    if (c.backFace) {
      // the pickup's cab back window, on the cab's rear face
      const z0 = c.backFace.z[0], z1 = c.backFace.z[1], u = c.backFace.u;
      const pts = [];
      [[-u, z0, 8], [-u, z1, 8], [u, z1, 8], [u, z0, 8]].forEach((e, i, arr) => {
        pts.push([main.end("tail", e[1], e[0]), e[2]]);
        const nx = arr[(i + 1) % 4];
        for (let k = 1; k < 4; k++) { const t = k / 4; pts.push([main.end("tail", e[1] + (nx[1] - e[1]) * t, e[0] + (nx[0] - e[0]) * t), "s"]); }
      });
      bg = pts.map((e) => { const q = P(e[0]); return [q[0], q[1], e[1]]; });
    } else bg = topGlass(main, c.back[0], c.back[1], c.backU, c.backU + 0.03, 9);
    glassMarkup.push(panelMarkup(key + "-back", "win", "back", [bg], { far: "windshield", cabin: cabKey, cal: calFor([bg]) }).markup);
  }

  // ----- body: per block, painter's order -----
  let body = "";
  // ground shadow and contact shadows
  const shadowPts = [];
  for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; shadowPts.push([500 + 520 * Math.cos(a), (c.hw + 40) * Math.sin(a), 0]); }
  body += '<path class="bt-shadow" d="' + closedOf(shadowPts) + '"/>';
  const wheelYs = [c.hw - 12, -(c.hw - 12)];
  const allWheels = [];
  blocks.forEach((blk) => (blk.g.arches || []).forEach((ax) => allWheels.push({ blk, ax })));
  allWheels.forEach((wh) => wheelYs.forEach((y) => {
    const ell = [];
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; ell.push([wh.ax + c.r * 0.86 * Math.cos(a), y - Math.sign(y) * c.tw / 2 + c.tw * 0.6 * Math.sin(a), 0]); }
    body += '<path class="bt-contact" d="' + closedOf(ell) + '"/>';
  }));
  // far wheels (their inner faces; mostly hidden by the body) and the far mirror
  if (!side) {
    allWheels.forEach((wh) => { body += wheel(P, wh.ax, c.r, -(c.hw - 12), c.tw, c.rimK, false); });
    body += '<path class="bt-mirror" d="' + dClosed(mirrorHull(P, main, c, false)) + '"/>';
  }
  const all = []; // every outline point, for the view box
  order.forEach((blk) => {
    const g = blk.g;
    // near wheels: the wheel well (dark), the tire, the rim; the body drawn next covers what the
    // arch hides
    (g.arches || []).forEach((ax) => {
      const well = [];
      const R = c.R, rk = g.archZ || c.rocker, dx = Math.sqrt(Math.max(0, R * R - Math.pow(c.r - rk, 2)));
      const a0 = Math.atan2(rk - c.r, dx), a1 = Math.PI - a0;
      for (let k = 0; k <= 14; k++) { const a = a0 + (a1 - a0) * k / 14; well.push(blk.near(ax + R * Math.cos(a), c.r + R * Math.sin(a), -6)); }
      body += '<path class="bt-well" d="' + closedOf(well) + '"/>';
      body += wheel(P, ax, c.r, c.hw - 12, c.tw, c.rimK, true);
    });
    // the body: the top and ends (between the near and far chain) and the near side
    // the end facing away from the viewer is left out of the top band (it would cover the far arch)
    const i0 = side || showNose ? 0 : blk.iN, i1 = side || showTail ? blk.pts.length - 1 : blk.iT;
    const vis = blk.pts.slice(i0, i1 + 1), visK = blk.kinds.slice(i0, i1 + 1);
    const kq = (k) => (k === "s" ? "s" : typeof k === "number" ? k : null);
    const nearChain = vis.map((p) => blk.near(p[0], p[1]));
    const farChain = vis.map((p) => blk.far(p[0], p[1]));
    const tK = visK.map(kq);
    tK[0] = null; tK[tK.length - 1] = null;
    // top band and near side as ONE path (two subpaths wound the same way): the outline painted
    // under the fill then only shows where the body meets the background or passes in front of
    // another block, never on the edge between the top and the side
    const area = (list) => { let a = 0; const q = list.map(P); for (let i = 0; i < q.length; i++) { const j = (i + 1) % q.length; a += q[i][0] * q[j][1] - q[j][0] * q[i][1]; } return a; };
    const tPts = nearChain.concat(farChain.slice().reverse()), tKs = tK.concat(tK.slice().reverse());
    // the near side: the SAME chain samples as the top band, then the bottom with its arches
    const nDense = blk.pts.map((p, i) => [p[0], p[1], i === 0 || i === blk.pts.length - 1 ? null : blk.kinds[i]]).concat(denseSV(blk.bottomSV, false, 12).slice(1, -1));
    let nPts = nDense.map((v) => blk.near(v[0], v[1])), nKs = nDense.map((v) => kq(v[2]));
    if (!side && Math.sign(area(nPts)) !== Math.sign(area(tPts))) { nPts = nPts.slice().reverse(); nKs = nKs.slice().reverse(); }
    // the band folds where the surface turns away from the viewer: split it at each fold and wind
    // every piece the same way as the near side, so the nonzero fill is one solid union
    const nSign = Math.sign(area(nPts)) || 1;
    const nearS = nearChain.map(P), farS = farChain.map(P);
    const qs = [];
    for (let i = 0; i < nearS.length - 1; i++) {
      const q = [nearS[i], nearS[i + 1], farS[i + 1], farS[i]];
      let a = 0; for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; a += q[k][0] * q[j][1] - q[j][0] * q[k][1]; }
      qs.push(Math.sign(a) || 1);
    }
    let tD = "";
    for (let i = 0; i < qs.length;) {
      let j = i; while (j + 1 < qs.length && qs[j + 1] === qs[i]) j++;
      const nearRun = nearS.slice(i, j + 2), farRun = farS.slice(i, j + 2).reverse();
      const kn = tK.slice(i, j + 2).map((k, m, arr) => (m === 0 || m === arr.length - 1 ? null : k));
      let piece = nearRun.concat(farRun).map((q, m) => [q[0], q[1], m < kn.length ? kn[m] : kn[kn.length - 1 - (m - kn.length)]]);
      if (qs[i] !== nSign) piece = piece.reverse();
      tD += pathD(piece, true).d;
      i = j + 1;
    }
    const nD = kindsClosedOf(nPts, nKs);
    nearChain.concat(farChain, nPts).forEach((p) => all.push(P(p)));
    body += add("bt-bodyfill bt-bodyline", side ? nD : tD + nD);
    // light from above: a faint lift on the top, a faint shade on the visible end
    if (!side) {
      const topN = blk.pts.slice(blk.iN, blk.iT + 1);
      body += add("bt-lit", closedOf(topN.map((p) => blk.near(p[0], p[1])).concat(topN.slice().reverse().map((p) => blk.far(p[0], p[1])))));
      const endZ = showNose ? blk.pts.slice(0, blk.iN + 1) : blk.pts.slice(blk.iT);
      if ((showNose && g.noseIn !== 0) || (showTail)) body += add("bt-shade", closedOf(endZ.map((p) => blk.near(p[0], p[1])).concat(endZ.slice().reverse().map((p) => blk.far(p[0], p[1])))));
    }
    // the pickup bed: the open box seen from above (floor and the inner walls that face the viewer)
    if (g.id === "bed" && !side) body += bedMarkup(blk, c, P, view);
    // glass on this block (the cab, or the one block)
    if (blk === main) body += glassMarkup.join("");
    // ----- detail lines -----
    let ln = "";
    // the edge between the top and the near side (near roof, pillar and hood edge), detail weight
    if (!side) ln += add("bt-dt", pathD(nearChain.map((p, i) => { const q = P(p); return [q[0], q[1], i === 0 || i === nearChain.length - 1 ? null : tK[i]]; }), false).d);
    // the edge between the top and the near side (the near roof, pillar and hood edge)
    if (blk === main) {
      // belt line under the side glass, the character crease and its highlight, lower sculpt, sill
      ln += add("bt-dt", sideLine(blk, c.belt.map((p) => [p[0], p[1] - 1, "s"])));
      ln += add("bt-dt", sideLine(blk, c.crease)) + add("bt-hl", sideLine(blk, c.crease.map((p) => [p[0], p[1] + 1.5, p[2]])));
      ln += add("bt-dt bt-d2", sideLine(blk, c.lower));
      ln += add("bt-dt", sideLine(blk, [[c.sill[0], c.sill[2]], [c.sill[1], c.sill[2]]]));
      c.seams.forEach((s) => { ln += add("bt-dt", sideLine(blk, s)); });
      if (c.track) ln += add("bt-dt", sideLine(blk, c.track));
      (c.bumperSide || []).forEach((s) => { ln += add("bt-dt bt-d2", sideLine(blk, s)); });
      if (c.fuel) ln += add("bt-dt bt-d2", sideShape(blk, [[c.fuel[0] - 12, c.fuel[1] - 12, 4], [c.fuel[0] - 12, c.fuel[1] + 12, 4], [c.fuel[0] + 12, c.fuel[1] + 12, 4], [c.fuel[0] + 12, c.fuel[1] - 12, 4]]));
      c.handles.forEach((h) => { ln += add("bt-dt bt-d2", sideShape(blk, [[h[0] - 15, h[1] - 3, 3], [h[0] - 15, h[1] + 3, 3], [h[0] + 15, h[1] + 3, 3], [h[0] + 15, h[1] - 3, 3]])); });
      ln += add("bt-dt", sideShape(blk, c.lampSide.head)) + add("bt-dt", sideShape(blk, c.lampSide.tail));
      // B-pillar blackout between the door glasses (the window line reads as one dark band)
      ln += pillarTrim(blk, c, glassSV, P);
      if (c.step) ln += add("bt-trimfill", closedOf([[c.step[0], c.hw + 4, c.step[2]], [c.step[1], c.hw + 4, c.step[2]], [c.step[1], c.hw + 4, c.step[3]], [c.step[0], c.hw + 4, c.step[3]]].map((p) => [p[0], p[1], p[2]]))) +
        add("bt-dt", closedOf([[c.step[0], c.hw + 4, c.step[2]], [c.step[1], c.hw + 4, c.step[2]], [c.step[1], c.hw + 4, c.step[3]], [c.step[0], c.hw + 4, c.step[3]]]));
      // hood shut lines on top (3/4), roof rails, windshield wipers
      if (!side) {
        const hd = c.hood;
        const hl = (u) => { const pts = []; for (let k = 0; k <= 8; k++) pts.push(blk.top(hd.x0 + (hd.x1 - hd.x0) * k / 8, u)); return pts; };
        ln += add("bt-dt", openOf(hl(hd.u))) + add("bt-dt", openOf(hl(-hd.u)));
        const across = []; for (let k = 0; k <= 10; k++) across.push(blk.top(hd.x1, -hd.u + 2 * hd.u * k / 10));
        ln += add("bt-dt", openOf(across));
        if (view === "front") {
          const wx = c.ws[0] + 6;
          ln += add("bt-dt bt-d2", openOf([blk.top(wx, -0.7), blk.top(wx + 3, -0.12)])) + add("bt-dt bt-d2", openOf([blk.top(wx, 0.05), blk.top(wx + 3, 0.62)]));
        }
        if (c.rails) {
          [-1, 1].forEach((sg) => {
            const pts = []; for (let k = 0; k <= 10; k++) { const p = blk.top(c.rails.x0 + (c.rails.x1 - c.rails.x0) * k / 10, sg * c.rails.u); pts.push([p[0], p[1], p[2] + c.rails.h]); }
            ln += add("bt-dt", openOf(pts));
            [0, 10].forEach((k) => { const p = blk.top(c.rails.x0 + (c.rails.x1 - c.rails.x0) * k / 10, sg * c.rails.u); ln += add("bt-dt", openOf([p, [p[0], p[1], p[2] + c.rails.h]])); });
          });
        }
      } else if (c.rails) {
        // Side: the near rail sits on the roof's top line (the crown hides its foot), legs at the ends
        const pts = []; for (let k = 0; k <= 10; k++) { const p = blk.top(c.rails.x0 + (c.rails.x1 - c.rails.x0) * k / 10, 0); pts.push([p[0], p[1], p[2] + c.rails.h - 2]); }
        ln += add("bt-dt", openOf(pts));
        [0, 10].forEach((k) => { const p = blk.top(c.rails.x0 + (c.rails.x1 - c.rails.x0) * k / 10, 0); ln += add("bt-dt", openOf([[p[0], p[1], p[2] - 1], [p[0], p[1], p[2] + c.rails.h - 2]])); });
      }
      // SUV wheel-arch cladding and the lower cladding line
      if (c.cladding) {
        blocks.forEach((b2) => (b2.g.arches || []).forEach((ax) => {
          const R2 = c.R + c.cladding, rk = c.rocker, dx = Math.sqrt(R2 * R2 - Math.pow(c.r - rk, 2));
          const a0 = Math.atan2(rk - c.r, dx), a1 = Math.PI - a0, pts = [];
          for (let k = 0; k <= 16; k++) { const a = a0 + (a1 - a0) * k / 16; pts.push(b2.near(ax + R2 * Math.cos(a), c.r + R2 * Math.sin(a))); }
          ln += add("bt-dt", openOf(pts));
        }));
      }
    }
    // wheel arch lip, a line just outside each arch
    (g.arches || []).forEach((ax) => {
      if (c.cladding) return;
      const R2 = c.R + 6, rk = g.archZ || c.rocker, dx = Math.sqrt(Math.max(0, R2 * R2 - Math.pow(c.r - rk, 2)));
      const a0 = Math.atan2(rk - c.r, dx), a1 = Math.PI - a0, pts = [];
      for (let k = 0; k <= 16; k++) { const a = a0 + (a1 - a0) * k / 16; pts.push(blk.near(ax + R2 * Math.cos(a), c.r + R2 * Math.sin(a))); }
      ln += add("bt-dt bt-d2", openOf(pts));
    });
    // the visible end: lamps, grille, intake, plate, bumper lines (front 3/4) or the rear face
    if (showNose && blk === main) ln += noseMarkup(blk, c, P);
    if (showTail && (g.id === "bed" || (blk === main && !c.blocks[1]))) ln += tailMarkup(blk, c, P);
    if (showTail && c.backFace && blk === main) {
      // pickup: third brake light above the cab back window
      ln += add("bt-dt bt-d2", closedOf([main.end("tail", 318, -0.12), main.end("tail", 318, 0.12), main.end("tail", 322, 0.12), main.end("tail", 322, -0.12)]));
    }
    body += '<g class="bt-lines">' + ln + "</g>";
  });
  // the near mirror, on top of everything
  body += '<path class="bt-mirror" d="' + dClosed(mirrorPts) + '"/>';
  mirrorPts.forEach((p) => all.push(p));
  const bb = boxOf(all.concat(side ? [[0, GY + 20], [1000, GY + 20]] : []));
  bb.y -= 4; bb.h += 12;
  return { key, bb, cabin, body, outline: side ? pathD(main.outlineSV.map((v) => [v[0], GY - v[1], v[2]]), true).d : null, wheels: allWheels.map((w) => [w.ax, GY - c.r]), r: c.r };

  // --- helpers that need the view ---
  function dlo(blk, spec) {
    // a side window in side coordinates: bottom on the belt, top along the chain pushed in by inset;
    // front and rear edges vertical at a given x, or following the chain, or a given curve
    let off = alongSV(blk.pts, spec.x0 - 80, spec.x1 + 80, spec.inset);
    off = off.filter((p) => p[1] >= blk.beltAt(p[0]) + 4 && (spec.front === "chain" || p[0] >= spec.front) && (typeof spec.rear !== "number" || p[0] <= spec.rear));
    if (Array.isArray(spec.rear)) off = off.filter((p) => p[0] <= spec.rear[0][0]);
    off = thin(off, 9);
    const vs = [];
    const topAt = (x) => { for (let i = 1; i < off.length; i++) if (off[i][0] >= x) { const a = off[i - 1], b2 = off[i]; return a[1] + (b2[1] - a[1]) * (x - a[0]) / ((b2[0] - a[0]) || 1); } return off[off.length - 1][1]; };
    if (spec.front === "chain") vs.push([off[0][0], blk.beltAt(off[0][0]), 5]);
    else { vs.push([spec.front, blk.beltAt(spec.front), 6]); vs.push([spec.front, topAt(spec.front), 6]); }
    off.forEach((p, i) => { if (spec.front !== "chain" && i === 0 && Math.abs(p[0] - spec.front) < 3) return; vs.push([p[0], p[1], "s"]); });
    if (typeof spec.rear === "number") { vs.push([spec.rear, topAt(spec.rear), 6]); vs.push([spec.rear, blk.beltAt(spec.rear), 6]); }
    else if (Array.isArray(spec.rear)) spec.rear.forEach((p) => vs.push(p));
    else { const l = off[off.length - 1]; vs[vs.length - 1][2] = "s"; vs.push([l[0] + 2, blk.beltAt(l[0]) + 1, 5]); }
    return vs;
  }
}

// points along the chain (side coordinates) between x1 and x2, pushed d inward (toward lower z)
function alongSV(pts, x1, x2, d) {
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (p[0] < x1 || p[0] > x2) continue;
    const a = pts[i - 1], b = pts[i + 1];
    let nx = b[1] - a[1], nz = -(b[0] - a[0]);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nz > 0) { nx = -nx; nz = -nz; }
    out.push([p[0] + nx * d, p[1] + nz * d]);
  }
  return out;
}
// an edge-on glass sliver hugging the chain (side view windshield and back glass), side coordinates
function sliverSV(blk, spec) {
  const [x1, x2, d1, d2, hMin] = spec;
  const o = thin(alongSV(blk.pts, x1, x2, d1).filter((p) => p[1] >= hMin), 10);
  const r = thin(alongSV(blk.pts, x1, x2, d2).filter((p) => p[1] >= hMin), 10).reverse();
  return o.map((p, i) => [p[0], p[1], i === 0 || i === o.length - 1 ? 3 : "s"]).concat(r.map((p, i) => [p[0], p[1], i === 0 || i === r.length - 1 ? 3 : "s"]));
}
// the mirror: its side profile pushed out from the door (near) or the far door, as a hull
function mirrorHull(P, blk, c, near) {
  const pts = [];
  const sg = near ? 1 : -1;
  c.mirror.forEach((m) => {
    const w0 = blk.w(m[0], m[1]);
    pts.push(P([m[0], sg * (w0 - 4), m[1]]));
    pts.push(P([m[0] + 4, sg * (w0 + 30), m[1] + (m[1] > c.mirror[0][1] + 8 ? -2 : 1)]));
  });
  return hull(pts);
}
function wheel(P, ax, r, yOut, tw, rimK, near) {
  // a tire as two circles (outer and inner face) and their hull, then (near side) the rim: a dark
  // disc, five plain spokes, the rim ring and the hub. Generic: no pattern of any make.
  const sg = Math.sign(yOut), N = 20;
  const ringAt = (rad, y, a0) => { const o = []; for (let k = 0; k < N; k++) { const a = (a0 || 0) + k / N * Math.PI * 2; o.push(P([ax + rad * Math.cos(a), y, r + rad * Math.sin(a)])); } return o; };
  const outer = ringAt(r, yOut), inner = ringAt(r, yOut - sg * tw);
  let s = '<path class="bt-tire" d="' + dClosed(hull(outer.concat(inner))) + '"/>';
  if (!near) return s + '<path class="bt-dt bt-d2" d="' + dClosed(inner) + '"/>';
  s += '<path class="bt-dt" d="' + dClosed(outer) + '"/>';
  const yr = yOut - sg * 3;
  s += '<path class="bt-rim" d="' + dClosed(ringAt(r * rimK, yr)) + '"/>';
  // spokes: five tapered bars from the hub to the rim
  let sp = "";
  const ri = r * rimK * 0.9, rh = r * 0.19;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + k * Math.PI * 2 / 5;
    const pt = (rad, da) => P([ax + rad * Math.cos(a + da), yr, r + rad * Math.sin(a + da)]);
    sp += pathD([pt(rh, -0.34), pt(ri, -0.13), pt(ri, 0.13), pt(rh, 0.34)].map((q, i) => [q[0], q[1], i === 1 || i === 2 ? 2 : 1]), true).d;
  }
  s += '<path class="bt-spoke" d="' + sp + '"/>';
  s += '<path class="bt-dt bt-d2" d="' + dClosed(ringAt(r * rimK * 0.9, yr)) + '"/>';
  s += '<path class="bt-dt" d="' + dClosed(ringAt(r * 0.18, yr - sg * 2)) + '"/>';
  return s;
}
function pillarTrim(blk, c, glassSV, P) {
  // the dark band between the front door glass and the first rear glass
  const f = glassSV.front[0], r = glassSV.rear[0];
  const fr = f.filter((v) => typeof v[2] === "number").slice(-2); // rear edge of the front glass (top, bottom)
  const rf = r.slice(0, 2); // front edge of the rear glass (bottom, top)
  if (fr.length < 2 || rf.length < 2) return "";
  const pts = [[fr[0][0], fr[0][1]], [rf[1][0], rf[1][1]], [rf[0][0], rf[0][1]], [fr[1][0], fr[1][1]]].map((p) => P(blk.near(p[0], p[1], 0.4)));
  return '<path class="bt-trimfill" d="' + pathD(pts.map((q) => [q[0], q[1], 3]), true).d + '"/>';
}
function noseMarkup(blk, c, P) {
  const f = c.face;
  const pE = (u, z) => P(blk.end("nose", z, u));
  const shape = (list) => pathD(list.map((e) => { const q = pE(e[0], e[1]); return [q[0], q[1], e[2]]; }), true).d;
  const mir = (list) => list.map((e) => [-e[0], e[1], e[2]]).reverse();
  const rect = (r4, rad) => shape([[r4[0], r4[2], rad], [r4[0], r4[3], rad], [r4[1], r4[3], rad], [r4[1], r4[2], rad]]);
  let s = "";
  s += '<path class="bt-dt" d="' + shape(f.head) + shape(mir(f.head)) + '"/>';
  // headlamp inner line (lamp detail, phone hides it)
  const inner = f.head.map((e) => [0.15 * 0.75 + e[0] * 0.85 + 0.02, (e[1] + (f.head[0][1] + f.head[2][1]) / 2) / 2 + 2, e[2]]);
  s += '<path class="bt-dt bt-d2" d="' + shape(inner) + shape(mir(inner)) + '"/>';
  s += '<path class="bt-dt bt-grille" d="' + shape(f.grille) + '"/>';
  s += '<path class="bt-dt" d="' + dOpen([pE(f.grille[0][0] + 0.03, f.bar), pE(0, f.bar), pE(f.grille[2][0] - 0.03, f.bar)]) + '"/>';
  if (f.intake) s += '<path class="bt-dt bt-grille" d="' + shape(f.intake) + '"/>';
  if (f.fog) s += '<path class="bt-dt bt-d2" d="' + shape(f.fog) + shape(mir(f.fog)) + '"/>';
  if (f.plate) s += '<path class="bt-dt bt-d2" d="' + rect(f.plate, 3) + '"/>';
  (f.lines || []).forEach((l) => { const pts = []; for (let k = 0; k <= 8; k++) pts.push(pE(l[0] + (l[2] - l[0]) * k / 8, l[1] + (l[3] - l[1]) * k / 8)); s += '<path class="bt-dt" d="' + dOpen(pts) + '"/>'; });
  return s;
}
function tailMarkup(blk, c, P) {
  const f = c.rearFace;
  const pE = (u, z) => P(blk.end("tail", z, u));
  const shape = (list) => pathD(list.map((e) => { const q = pE(e[0], e[1]); return [q[0], q[1], e[2]]; }), true).d;
  const mir = (list) => list.map((e) => [-e[0], e[1], e[2]]).reverse();
  const rect = (r4, rad) => shape([[r4[0], r4[2], rad], [r4[0], r4[3], rad], [r4[1], r4[3], rad], [r4[1], r4[2], rad]]);
  const line = (l) => { const pts = []; for (let k = 0; k <= 8; k++) pts.push(pE(l[0] + (l[2] - l[0]) * k / 8, l[1] + (l[3] - l[1]) * k / 8)); return dOpen(pts); };
  let s = "";
  s += '<path class="bt-dt" d="' + shape(f.tail) + shape(mir(f.tail)) + '"/>';
  if (f.lid) {
    // sedan trunk lid: its front edge under the back glass, its sides along the deck, down the
    // tail between the lamps
    const L = f.lid, pts = [];
    for (let k = 0; k <= 6; k++) pts.push([blk.top(L.top[0] + (L.top[1] - L.top[0]) * k / 6, -L.u), k === 0 ? null : "s"]);
    const zTop = blk.pts[blk.iT][1] - 4;
    pts.push([blk.end("tail", zTop, -L.u * 0.98), "s"]);
    pts.push([blk.end("tail", zTop - 12, -L.inner), 8]);
    pts.push([blk.end("tail", L.low, -L.inner), 8]);
    pts.push([blk.end("tail", L.low, L.inner), 8]);
    pts.push([blk.end("tail", zTop - 12, L.inner), 8]);
    pts.push([blk.end("tail", zTop, L.u * 0.98), "s"]);
    for (let k = 6; k >= 0; k--) pts.push([blk.top(L.top[0] + (L.top[1] - L.top[0]) * k / 6, L.u), k === 0 ? null : "s"]);
    s += '<path class="bt-dt" d="' + pathD(pts.map((e) => { const q = P(e[0]); return [q[0], q[1], e[1]]; }), false).d + '"/>';
  }
  if (f.gate) {
    // SUV and van liftgate: its top edge on the roof, its sides down beside the glass, then down
    // between the lamps to the bumper
    const G = f.gate, pts = [];
    const sideDown = (u) => { const o = []; const chainPts = blk.range(G.topX, blk.top(G.topX, 0)[2], 1000, G.glassBase, u); chainPts.forEach((p) => o.push(p)); return o; };
    const left = sideDown(-G.u);
    left.forEach((p, i) => pts.push([p, i === 0 ? null : i === left.length - 1 ? 10 : "s"]));
    pts.push([blk.end("tail", G.glassBase - 14, -G.inner), 10]);
    pts.push([blk.end("tail", G.low, -G.inner), 8]);
    pts.push([blk.end("tail", G.low, G.inner), 8]);
    pts.push([blk.end("tail", G.glassBase - 14, G.inner), 10]);
    const right = sideDown(G.u).reverse();
    right.forEach((p, i) => pts.push([p, i === right.length - 1 ? null : i === 0 ? 10 : "s"]));
    s += '<path class="bt-dt" d="' + pathD(pts.map((e) => { const q = P(e[0]); return [q[0], q[1], e[1]]; }), false).d + '"/>';
    const sp = []; for (let k = 0; k <= 10; k++) sp.push(blk.top(f.spoiler[0], -0.95 + 1.9 * k / 10));
    s += '<path class="bt-dt bt-d2" d="' + dOpen(sp.map(P)) + '"/>';
  }
  if (f.tailgate) {
    s += '<path class="bt-dt" d="' + rect(f.tailgate, 8) + '"/>';
    s += '<path class="bt-dt bt-d2" d="' + rect(f.handle, 3) + '"/>';
    s += '<path class="bt-dt" d="' + rect(f.bumper, 6) + '"/>';
    s += '<path class="bt-dt bt-d2" d="' + rect(f.step, 2) + '"/>';
  }
  if (f.plate) s += '<path class="bt-dt bt-d2" d="' + rect(f.plate, 3) + '"/>';
  if (f.refl) s += '<path class="bt-dt bt-d2" d="' + shape(f.refl) + shape(mir(f.refl)) + '"/>';
  (f.lines || []).forEach((l) => { s += '<path class="bt-dt" d="' + line(l) + '"/>'; });
  return s;
}
function bedMarkup(blk, c, P, view) {
  // the open bed: the opening (dark), and inside it the floor edges and corner that face the viewer,
  // clipped to the opening so the near wall hides what it should
  const top = 226, flr = c.bed.floor, ins = c.bed.inset;
  const x0 = 686, x1 = 994;
  const wi = (x) => blk.w(x, top) - ins;
  const open = [];
  for (let k = 0; k <= 8; k++) { const x = x0 + (x1 - x0) * k / 8; open.push([x, wi(x), top]); }
  for (let k = 8; k >= 0; k--) { const x = x0 + (x1 - x0) * k / 8; open.push([x, -wi(x), top]); }
  const sharp = (pts3) => pathD(pts3.map((p) => { const q = P(p); return [q[0], q[1]]; }), true).d;
  const oD = sharp(open);
  const id = "btbed-" + view;
  let s = '<defs><clipPath id="' + id + '"><path d="' + oD + '"/></clipPath></defs>';
  s += '<path class="bt-bed" d="' + oD + '"/>';
  const endX = view === "front" ? x1 : x0;
  // inside the opening: the far wall's inner face and the end wall that faces the viewer (the
  // tailgate from the front, the bed's front wall from the rear), a step lighter than the floor
  let ln = '<path class="bt-bedwall" d="' + sharp([[x0, -wi(x0), flr], [x1, -wi(x1), flr], [x1, -wi(x1), top], [x0, -wi(x0), top]]) + sharp([[endX, -wi(endX), flr], [endX, wi(endX), flr], [endX, wi(endX), top], [endX, -wi(endX), top]]) + '"/>';
  const fl = (pts) => '<path class="bt-dt" d="' + dOpen(pts.map(P)) + '"/>';
  ln += fl([[x0, -wi(x0), flr], [x1, -wi(x1), flr]]);
  ln += fl([[endX, -wi(endX), flr], [endX, wi(endX), flr]]);
  ln += fl([[endX, -wi(endX), flr], [endX, -wi(endX), top]]);
  s += '<g clip-path="url(#' + id + ')">' + ln + "</g>";
  // the rail caps
  s += '<path class="bt-dt" d="' + pathD(open.slice(0, 9).map((p) => { const q = P(p); return [q[0], q[1]]; }), false).d + '"/>';
  return s;
}

const BODY_IDS = ["car", "suv", "pickup", "van"];
const VIEWS = ["side", "front", "rear"];
function buildGraphics() {
  return BODY_IDS.map((id) => {
    const views = {};
    VIEWS.forEach((v) => { views[v] = vehicleView(id, v); });
    return { id, views };
  });
}

module.exports = { buildGraphics, VIEWS, BODY_IDS, pathD, boxOf, GY, CARS };
