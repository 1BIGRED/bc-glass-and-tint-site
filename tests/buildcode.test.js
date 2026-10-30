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
  const lo = panel === "front" ? 35 : 5;
  return lo + Math.floor(rand() * (100 - lo));
}

// 1. 500 random valid builds round-trip exactly.
let roundTrips = 0;
for (let i = 0; i < 500; i++) {
  const b = {
    v: pick(["car", "suv", "pickup", "van"]),
    front: shade("front"),
    rear: shade("rear"),
    back: rand() < 0.5 ? null : shade("back"),
    addons: B.ADDONS.filter(() => rand() < 0.5).map((a) => a.id)
  };
  if (b.back === null) b.back = b.rear; // exercise the short form often
  const code = B.encode(b);
  const back = B.decode(code);
  if (code && same(back, b)) roundTrips++;
  else console.log("round trip broke:", JSON.stringify(b), code, JSON.stringify(back));
  ok(code && same(B.decode(B.encode(back)), back), "re-encode stable " + i);
  ok(code && /^BC-[CSPV](?:\d\d|xx){2,3}[TRWH]{0,4}$/.test(code), "format " + code);
}
ok(roundTrips === 500, "500 of 500 random builds round-trip (" + roundTrips + ")");

// 2. Engineering example and its summary.
ok(same(B.decode("BC-S3520T"), { v: "suv", front: 35, rear: 20, back: 20, addons: ["top-strip"] }), "BC-S3520T decodes");
ok(B.encode({ v: "suv", front: 35, rear: 20, back: 20, addons: ["top-strip"] }) === "BC-S3520T", "BC-S3520T encodes");
ok(B.summary("BC-S3520T") === "SUV. Front doors, medium shade. Rear doors and back glass, dark shade. Windshield top strip.", "summary in words while shades are unconfirmed: " + B.summary("BC-S3520T"));
ok(B.summary("BC-S3520T", { confirmed: [35, 20] }) === "SUV. Front doors, 35 percent. Rear doors and back glass, 20 percent. Windshield top strip.", "summary with confirmed numbers");
ok(B.summary("BC-C35xxWH") === "Car. Front doors, medium shade. Rear doors and back glass, shade to pick. Also ask about windshield ceramic coating and headlight restoration.", "summary unset shades and asks: " + B.summary("BC-C35xxWH"));
ok(B.decode("BC-C35xxxx") === null, "non-canonical long form (back equals rear) is refused");
ok(B.summary("BC-P0000") === "Pickup. No windows picked yet.", "summary empty build");
ok(B.encode({ v: "car", front: "x", rear: "x", back: "x", addons: [] }) === "BC-Cxxxx", "unset shades encode as xx");
ok(same(B.decode("bc-cxxxx"), { v: "car", front: "x", rear: "x", back: "x", addons: [] }), "decode is case-insensitive");
ok(same(B.decode("BC-V700015"), { v: "van", front: 70, rear: 0, back: 15, addons: [] }), "three-token form when back differs");

// 3. Old v2 codes still decode; an illegal old front does not.
ok(same(B.decode("BC-C-35-15-15-0"), { v: "car", front: 35, rear: 15, back: 15, addons: [] }), "legacy BC-C-35-15-15-0");
ok(same(B.decode("C-35-15-15-0"), { v: "car", front: 35, rear: 15, back: 15, addons: [] }), "legacy C-35-15-15-0 (old prices card link)");
ok(same(B.decode("BC-S-50-20-20-15"), { v: "suv", front: 50, rear: 20, back: 20, addons: ["top-strip"] }), "legacy strip becomes T");
ok(B.decode("C-20-15-15-0") === null, "legacy illegal front is refused");

// 4. Invalid codes give null, never an exception.
const bad = [
  "", " ", "BC-", "BC-X3520", "BC-C2020", "BC-C3420", "BC-C0520", "BC-C3520TT", "BC-C352020", "BC-C35",
  "BC-C35201510", "BC-C3520Z", "BC-C0300", "BC-C35-20", "hello", "BC-C3520T ".repeat(4),
  "<script>alert(1)</script>", "BC-C3520%3Cs", "BC-CXX20Q", "BC-C1x20", "BC-C3520TRWHT",
  null, undefined, 123, {}, []
];
bad.forEach((c) => {
  let r;
  try { r = B.decode(c); } catch (e) { r = "threw " + e.message; }
  ok(r === null, "invalid " + JSON.stringify(c) + " -> null (got " + JSON.stringify(r) + ")");
});

// 5. The law guard on encode: no front-door shade below 35, ever.
[34, 20, 15, 5, 1].forEach((v) => ok(B.encode({ v: "car", front: v, rear: 0, back: 0, addons: [] }) === null, "encode refuses front " + v));
ok(B.encode({ v: "truck", front: 35, rear: 0, back: 0, addons: [] }) === null, "encode refuses an unknown class");
ok(B.encode({ v: "car", front: 35, rear: 0, back: 0, addons: ["top-strip", "top-strip"] }) === null, "encode refuses a repeated add-on");
ok(B.encode({ v: "car", front: 35, rear: 0, back: 0, addons: ["full-windshield"] }) === null, "encode refuses an unknown add-on (no full windshield)");

console.log((fail ? "FAILED" : "PASSED") + ": " + pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;
