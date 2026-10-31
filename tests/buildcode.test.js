// node tests\buildcode.test.js   (WS4 acceptance, engineering 6: encode then decode is identity
// for 500 random valid builds; decode of an invalid code returns null). No test framework.
"use strict";
const B = require("../lib/buildcode");
const browserCopy = require("../assets/v3/js/builder/10-buildcode.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; console.log("FAIL " + name); }
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

ok(B === browserCopy, "lib/buildcode.js is the browser file itself (one copy)");

// Seeded PRNG so a failure can be reproduced (mulberry32).
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261029);
const pick = (list) => list[Math.floor(rand() * list.length)];
function shade(panel) {
  const r = rand();
  if (r < 0.2) return 0;
  if (r < 0.3) return "x";
  // Chase 2026-10-31: every panel, front doors included, takes any shade from 5 to 99
  return 5 + Math.floor(rand() * 95);
}

// 1. 500 random valid builds round-trip exactly.
let roundTrips = 0;
for (let i = 0; i < 500; i++) {
  const b = {
    v: pick(["car", "suv", "pickup", "van"]),
    front: shade("front"),
    rear: shade("rear"),
    back: rand() < 0.5 ? null : shade("back"),
    windshield: rand() < 0.5 ? 0 : shade("windshield"),
    addons: B.ADDONS.filter(() => rand() < 0.5).map((a) => a.id)
  };
  if (b.back === null) b.back = b.rear; // exercise the short form often
  // a filmed full windshield covers the top strip, so a valid build never carries both
  if (b.windshield !== 0) b.addons = b.addons.filter((id) => id !== "top-strip");
  const code = B.encode(b);
  const back = B.decode(code);
  if (code && same(back, b)) roundTrips++;
  else console.log("round trip broke:", JSON.stringify(b), code, JSON.stringify(back));
  ok(code && same(B.decode(B.encode(back)), back), "re-encode stable " + i);
  ok(code && /^BC-[CSPV](?:\d\d|xx){2,3}(?:F(?:\d\d|xx))?[TRWH]{0,4}$/.test(code), "format " + code);
}
ok(roundTrips === 500, "500 of 500 random builds round-trip (" + roundTrips + ")");

// 2. Engineering example and its summary.
ok(same(B.decode("BC-S3520T"), { v: "suv", front: 35, rear: 20, back: 20, windshield: 0, addons: ["top-strip"] }), "BC-S3520T decodes");
ok(B.encode({ v: "suv", front: 35, rear: 20, back: 20, addons: ["top-strip"] }) === "BC-S3520T", "BC-S3520T encodes");
ok(B.summary("BC-S3520T") === "SUV. Front doors, medium shade. Rear doors and back glass, dark shade. Windshield top strip.", "summary in words while shades are unconfirmed: " + B.summary("BC-S3520T"));
ok(B.summary("BC-S3520T", { confirmed: [35, 20] }) === "SUV. Front doors, 35 percent. Rear doors and back glass, 20 percent. Windshield top strip.", "summary with confirmed numbers");
ok(B.summary("BC-C35xxWH") === "Car. Front doors, medium shade. Rear doors and back glass, shade to pick. Also ask about windshield ceramic coating and headlight restoration.", "summary unset shades and asks: " + B.summary("BC-C35xxWH"));
ok(B.decode("BC-C35xxxx") === null, "non-canonical long form (back equals rear) is refused");
ok(B.summary("BC-P0000") === "Pickup. No windows picked yet.", "summary empty build");
ok(B.encode({ v: "car", front: "x", rear: "x", back: "x", addons: [] }) === "BC-Cxxxx", "unset shades encode as xx");
ok(same(B.decode("bc-cxxxx"), { v: "car", front: "x", rear: "x", back: "x", windshield: 0, addons: [] }), "decode is case-insensitive");
ok(same(B.decode("BC-V700015"), { v: "van", front: 70, rear: 0, back: 15, windshield: 0, addons: [] }), "three-token form when back differs");

// 3. Old v2 codes still decode, a dark old front too (front doors take every shade since 2026-10-31).
ok(same(B.decode("BC-C-35-15-15-0"), { v: "car", front: 35, rear: 15, back: 15, windshield: 0, addons: [] }), "legacy BC-C-35-15-15-0");
ok(same(B.decode("C-35-15-15-0"), { v: "car", front: 35, rear: 15, back: 15, windshield: 0, addons: [] }), "legacy C-35-15-15-0 (old prices card link)");
ok(same(B.decode("BC-S-50-20-20-15"), { v: "suv", front: 50, rear: 20, back: 20, windshield: 0, addons: ["top-strip"] }), "legacy strip becomes T");
ok(same(B.decode("C-20-15-15-0"), { v: "car", front: 20, rear: 15, back: 15, windshield: 0, addons: [] }), "legacy dark front decodes (Chase 2026-10-31)");

// 4. Invalid codes give null, never an exception.
const bad = [
  "", " ", "BC-", "BC-X3520", "BC-C0420", "BC-C3401", "BC-C3520F00", "BC-C3520F70T", "BC-C3520F03", "BC-C3520F7",
  "BC-C3520F70F70", "BC-C3520TF70", "BC-C3520TT", "BC-C352020", "BC-C35",
  "BC-C35201510", "BC-C3520Z", "BC-C0300", "BC-C35-20", "hello", "BC-C3520T ".repeat(4),
  "<script>alert(1)</script>", "BC-C3520%3Cs", "BC-CXX20Q", "BC-C1x20", "BC-C3520TRWHT",
  null, undefined, 123, {}, []
];
bad.forEach((c) => {
  let r;
  try { r = B.decode(c); } catch (e) { r = "threw " + e.message; }
  ok(r === null, "invalid " + JSON.stringify(c) + " -> null (got " + JSON.stringify(r) + ")");
});

// 5. Front doors take every shade from 5 (Chase 2026-10-31); darker than 35 carries the Nevada note.
[34, 20, 15, 5].forEach((v) => ok(B.encode({ v: "car", front: v, rear: 0, back: 0, addons: [] }) === "BC-C" + (v < 10 ? "0" : "") + v + "00", "encode accepts front " + v));
[4, 1].forEach((v) => ok(B.encode({ v: "car", front: v, rear: 0, back: 0, addons: [] }) === null, "encode refuses front " + v + " (below the 5 percent floor)"));
ok(B.FRONT_MIN === 35, "FRONT_MIN stays the Nevada line (35) for the note");
ok(B.summary("BC-C2000", { confirmed: [20] }) === "Car. Front doors, 20 percent. " + B.LABELS.front_dark, "a dark front carries the Nevada note: " + B.summary("BC-C2000", { confirmed: [20] }));
ok(B.summary("BC-C3500", { confirmed: [35] }) === "Car. Front doors, 35 percent.", "front 35 carries no note");
ok(B.LABELS.front_dark === "Darker than Nevada allows on front doors for driving (35 percent, NRS 484D.440). For a medical exemption or show use.", "the note is the wording Chase approved");

// 6. The full windshield (Chase 2026-10-31): F plus a token, and it covers the top strip.
ok(B.encode({ v: "suv", front: 35, rear: 20, back: 20, windshield: 70, addons: [] }) === "BC-S3520F70", "full windshield encodes as F70");
ok(same(B.decode("BC-S3520F45"), { v: "suv", front: 35, rear: 20, back: 20, windshield: 45, addons: [] }), "F45 decodes");
ok(B.encode({ v: "car", front: 35, rear: 35, back: 35, windshield: 50, addons: ["top-strip", "headlights"] }) === "BC-C3535F50H", "a filmed windshield drops the top strip from the code");
ok(B.decode("BC-C3535F50T") === null, "a code with both the full windshield and the strip is not canonical, so refused");
// peak 10-31 W3: a picked full windshield shade carries the Nevada note; the top strip and an
// unpicked ("xx") windshield shade never do
ok(B.summary("BC-C0000F70", { confirmed: [70] }) === "Car. Full windshield, 70 percent. " + B.LABELS.windshield_dark, "summary names the full windshield and carries the note: " + B.summary("BC-C0000F70", { confirmed: [70] }));
ok(/Darker than Nevada allows on the windshield for driving/.test(B.LABELS.windshield_dark) && /medical exemption or show use/.test(B.LABELS.windshield_dark), "the windshield note says darker than Nevada allows for driving, medical exemption or show use");
ok(B.summary("BC-C3535T", { confirmed: [35] }).indexOf(B.LABELS.windshield_dark) < 0, "the top strip never carries the windshield note");
ok(B.summary("BC-C0000Fxx").indexOf(B.LABELS.windshield_dark) < 0, "a windshield with the shade still to pick carries no note");
ok(B.summary("BC-C3535", { confirmed: [35] }).indexOf("Darker than Nevada") < 0, "a 35 build carries no note at all");
ok(B.encode({ v: "truck", front: 35, rear: 0, back: 0, addons: [] }) === null, "encode refuses an unknown class");
ok(B.encode({ v: "car", front: 35, rear: 0, back: 0, addons: ["top-strip", "top-strip"] }) === null, "encode refuses a repeated add-on");
ok(B.encode({ v: "car", front: 35, rear: 0, back: 0, addons: ["full-windshield"] }) === null, "encode refuses an unknown add-on (no full windshield)");

console.log((fail ? "FAILED" : "PASSED") + ": " + pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;
