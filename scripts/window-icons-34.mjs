// scripts/window-icons-34.mjs - writes the front 3/4 and rear 3/4 macros for _includes/v3/windows.njk from each
// vehicle's side-view key points. Construction: the near side is the side view squashed to S of its
// length (a transform, so the wheels become ellipses); the car's width runs along W, so every far point
// is the near point + W. Run: node scripts/window-icons-34.mjs, then paste its output over the _front and _back macros in _includes/v3/windows.njk. Front 3/4: the nose faces right (as in the side view). Rear 3/4: the side view
// is mirrored so the tail faces right. Prints the Nunjucks to stdout.
const S = 0.58, W = [13, -2.6], B = 21;
const f = (n) => (Math.round(n * 100) / 100).toString();
const pt = (p) => f(p[0]) + ' ' + f(p[1]);
const add = (p, v = W, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const poly = (ps) => 'M' + ps.map(pt).join('L') + 'z';
const line = (ps) => 'M' + ps.map(pt).join('L');
// a parallelogram on a face: corner a, down vector d (along the face's height), u0..u1 across W, v0..v1 down
const onFace = (a, d, u0, u1, v0, v1) => poly([add(add(a, W, u0), d, v0), add(add(a, W, u1), d, v0), add(add(a, W, u1), d, v1), add(add(a, W, u0), d, v1)]);

const V = {
  car: { nose: 57.4, faceTop: 15.4, hood: [54, 13.9], wsBase: [40.4, 13], wsTop: [32.6, 7.6], roofRear: [20.9, 7.4],
         rear: 'slope', bgTop: [19.2, 7.9], bgBase: [12.4, 13.4], tailTop: [6.4, 14], tail: 3.6, tailFaceTop: 15.4 },
  suv: { nose: 57.6, faceTop: 14.8, hood: [54.5, 13.4], wsBase: [44.6, 12.4], wsTop: [37.4, 5.9], roofRear: [6, 5.5],
         rear: 'flat', tail: 2.6, roofY: 6.2, gTop: 7, gBase: 12.4 },
  van: { nose: 57.6, faceTop: 15.4, hood: [54.6, 14], wsBase: [45.4, 13], wsTop: [36.8, 5.6], roofRear: [6, 5],
         rear: 'flat', tail: 2.6, roofY: 6, gTop: 6.8, gBase: 12.6 },
  pickup: { nose: 57.6, faceTop: 14.8, hood: [54.4, 13.4], wsBase: [44, 12.4], wsTop: [37.6, 6.2], roofRear: [23.6, 5.6],
         rear: 'bed', cab: 21.2, cabTop: 6.4, gTop: 7.2, gBase: 11, bedY: 12, tail: 2.6 }
};

function front(id) {
  const v = V[id]; const X = (p) => [p[0] * S, p[1]];
  const nTop = X([v.nose, v.faceTop]), nBot = X([v.nose, B]);
  const hood = X(v.hood), wb = X(v.wsBase), wt = X(v.wsTop), rr = X(v.roofRear);
  const down = [0, B - v.faceTop];
  const ws = poly([wt, wb, add(wb), add(wt)]);
  const sTop = wt, sBot = lerp(wt, wb, 0.3);
  const out = [];
  out.push(`    <g transform="scale(${S} 1)">{{ _side("${id}", on, true) }}</g>`);
  out.push(`    <path class="v3-win__body" d="${poly([wb, hood, nTop, add(nTop), add(hood), add(wb)])}"/>`);
  out.push(`    <path class="v3-win__body" d="${poly([nTop, nBot, add(nBot), add(nTop)])}"/>`);
  out.push(`    <path class="v3-win__body" d="${line([wt, add(wt), add(rr), rr])}"/>`);
  out.push(`    <path class="v3-win__mark" d="${onFace(nTop, down, 0.06, 0.3, 0.12, 0.3)}${onFace(nTop, down, 0.7, 0.94, 0.12, 0.3)}"/>`);
  out.push(`    <path class="v3-win__body" d="${onFace(nTop, down, 0.36, 0.64, 0.14, 0.42)}"/>`);
  out.push(`    <path class="v3-win__g" d="${ws}"/>`);
  out.push(`    <path class="v3-win__g{% if 'strip' in on %} is-on{% endif %}" d="${poly([sTop, sBot, add(sBot), add(sTop)])}"/>`);
  return out.join('\n');
}

function back(id) {
  const v = V[id];
  const M = (p) => [(60 - p[0]) * S, p[1]]; // mirrored: the tail faces right
  const out = [];
  out.push(`    <g transform="translate(${f(60 * S)} 0) scale(-${S} 1)">{{ _side("${id}", on, true) }}</g>`);
  if (v.rear === 'slope') {
    const bt = M(v.bgTop), bb = M(v.bgBase), tt = M(v.tailTop), ft = M([v.tail, v.tailFaceTop]), fb = M([v.tail, B]), rr = M(v.wsTop);
    const down = [0, B - v.tailFaceTop];
    out.push(`    <path class="v3-win__body" d="${poly([bb, tt, ft, add(ft), add(tt), add(bb)])}"/>`);
    out.push(`    <path class="v3-win__body" d="${poly([ft, fb, add(fb), add(ft)])}"/>`);
    out.push(`    <path class="v3-win__body" d="${line([rr, add(rr), add(bt)])}"/>`);
    out.push(`    <path class="v3-win__mark" d="${onFace(ft, down, 0.05, 0.27, 0.1, 0.3)}${onFace(ft, down, 0.73, 0.95, 0.1, 0.3)}"/>`);
    out.push(`    <path class="v3-win__body" d="${onFace(ft, down, 0.38, 0.62, 0.4, 0.68)}"/>`);
    out.push(`    <path class="v3-win__g{% if 'back' in on %} is-on{% endif %}" d="${poly([bt, bb, add(bb), add(bt)])}"/>`);
  } else if (v.rear === 'flat') {
    const top = M([v.tail, v.roofY]), bot = M([v.tail, B]), rr = M(v.wsTop);
    const down = [0, B - v.roofY];
    const g0 = (v.gTop - v.roofY) / (B - v.roofY), g1 = (v.gBase - v.roofY) / (B - v.roofY);
    out.push(`    <path class="v3-win__body" d="${poly([top, bot, add(bot), add(top)])}"/>`);
    out.push(`    <path class="v3-win__body" d="${line([rr, add(rr), add(top)])}"/>`);
    out.push(`    <path class="v3-win__mark" d="${onFace(top, down, 0.04, 0.16, g1 + 0.04, g1 + 0.3)}${onFace(top, down, 0.84, 0.96, g1 + 0.04, g1 + 0.3)}"/>`);
    out.push(`    <path class="v3-win__body" d="${onFace(top, down, 0.38, 0.62, g1 + 0.18, g1 + 0.36)}"/>`);
    out.push(`    <path class="v3-win__g{% if 'back' in on %} is-on{% endif %}" d="${onFace(top, down, 0.1, 0.9, g0, g1)}"/>`);
  } else {
    const cTop = M([v.cab, v.cabTop]), cBot = M([v.cab, v.bedY]), rr = M(v.wsTop);
    const tTop = M([v.tail, v.bedY]), tBot = M([v.tail, B]);
    const cd = [0, v.bedY - v.cabTop], td = [0, B - v.bedY];
    const g0 = (v.gTop - v.cabTop) / (v.bedY - v.cabTop), g1 = (v.gBase - v.cabTop) / (v.bedY - v.cabTop);
    out.push(`    <path class="v3-win__body" d="${poly([cTop, cBot, add(cBot), add(cTop)])}"/>`);
    out.push(`    <path class="v3-win__body" d="${line([rr, add(rr), add(cTop)])}"/>`);
    out.push(`    <path class="v3-win__body" d="${poly([cBot, tTop, add(tTop), add(cBot)])}"/>`);
    out.push(`    <path class="v3-win__body" d="${poly([tTop, tBot, add(tBot), add(tTop)])}"/>`);
    out.push(`    <path class="v3-win__mark" d="${onFace(tTop, td, 0.03, 0.13, 0.1, 0.5)}${onFace(tTop, td, 0.87, 0.97, 0.1, 0.5)}"/>`);
    out.push(`    <path class="v3-win__body" d="${onFace(tTop, td, 0.4, 0.6, 0.2, 0.32)}"/>`);
    out.push(`    <path class="v3-win__g{% if 'back' in on %} is-on{% endif %}" d="${onFace(cTop, cd, 0.12, 0.88, g0, g1)}"/>`);
  }
  return out.join('\n');
}

let s = `{#- Front 3/4 view, local about 48 x 26 units: the side view squashed to ${S} (nose right), the car's
    width along (${W.join(', ')}). Generated by scripts/window-icons-34.mjs from each vehicle's key points. -#}
{% macro _front(c, on) -%}\n`;
['suv', 'pickup', 'van', 'car'].forEach((id, i) => { s += (i === 0 ? `{%- if c == "${id}" %}\n` : id === 'car' ? `{%- else %}\n` : `{%- elif c == "${id}" %}\n`) + front(id) + '\n'; });
s += `{%- endif %}\n{%- endmacro %}\n\n`;
s += `{#- Rear 3/4 view, local about 48 x 26 units: the side view mirrored (tail right) and squashed to ${S}. -#}
{% macro _back(c, on) -%}\n`;
['suv', 'pickup', 'van', 'car'].forEach((id, i) => { s += (i === 0 ? `{%- if c == "${id}" %}\n` : id === 'car' ? `{%- else %}\n` : `{%- elif c == "${id}" %}\n`) + back(id) + '\n'; });
s += `{%- endif %}\n{%- endmacro %}\n`;
process.stdout.write(s);
