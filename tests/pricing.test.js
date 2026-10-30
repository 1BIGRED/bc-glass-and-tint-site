// node tests\pricing.test.js   (WS4 acceptance, engineering 6). No test framework.
// With today's data: production shows 0 prices; preview shows drafts tagged; legal_hold never
// shows; fullVsParts is null unless all three pass and sum; a draft preset is absent in production;
// no front-door shade below 35 in any builder data.
"use strict";
const P = require("../lib/pricing");
const core = require("../assets/v3/js/builder/00-price-core.js");
const pricing = require("../_data/pricing.json");
const pg = require("../_data/pages/build_your_tint.json");
const { builderConfig } = require("../build-your-tint.11tydata.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; console.log("FAIL " + name); }
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const CLASSES = pricing.vehicle_classes.map((c) => c.id);

ok(P.priceFor === core.priceFor && P.quoteFor === core.quoteFor, "lib/pricing.js uses the one shared core (browser and build)");

// Every price entry in the file, with a path for messages.
function entries(pr) {
  const out = [];
  Object.keys(pr.services || {}).forEach((k) => out.push(["services." + k, pr.services[k]]));
  const at = pr.auto_tint || {};
  Object.keys(at.coverage || {}).forEach((k) => CLASSES.forEach((c) => out.push(["coverage." + k + "." + c, at.coverage[k][c]])));
  Object.keys(at.panels || {}).forEach((k) => CLASSES.forEach((c) => out.push(["panels." + k + "." + c, at.panels[k][c]])));
  out.push(["auto_tint.full_windshield_film", at.full_windshield_film]);
  return out;
}
const all = entries(pricing);
ok(all.length > 40, "found " + all.length + " price entries");

// 1. Production, today's data: zero prices show.
const prodShown = all.filter(([, e]) => P.priceFor(e, "production").show);
ok(prodShown.length === 0, "production shows 0 prices today (shown: " + prodShown.map((x) => x[0]).join(", ") + ")");
ok(pricing.services.chip_repair_first.status === "confirmed" && pricing.services.chip_repair_first.publish === false, "chip first is confirmed but not published");
ok(!P.priceFor(pricing.services.chip_repair_first, "production").show, "chip first hidden in production");
ok(P.priceFor(pricing.services.chip_repair_first, "production").display === P.FALLBACK, "hidden price returns fallback words, not a number");

// 2. Preview: drafts and confirmed-unpublished show, every one tagged draft.
const prevShown = all.filter(([, e]) => P.priceFor(e, "preview").show);
ok(prevShown.length > 0, "preview shows drafts (" + prevShown.length + ")");
ok(prevShown.every(([, e]) => P.priceFor(e, "preview").draft === true), "every preview price today is tagged draft");
ok(P.priceFor(pricing.services.chip_repair_first, "preview").draft === true, "chip first shows tagged on preview");
ok(prevShown.every(([, e]) => e.status === "draft" || e.status === "confirmed"), "preview never shows an unknown entry");

// 3. legal_hold never shows, in either mode, whatever its status.
ok(!P.priceFor(pricing.auto_tint.full_windshield_film, "production").show, "full windshield film hidden in production");
ok(!P.priceFor(pricing.auto_tint.full_windshield_film, "preview").show, "full windshield film hidden in preview");
const held = { status: "confirmed", publish: true, amount: 200, display: "$200", legal_hold: true };
ok(!P.priceFor(held, "production").show && !P.priceFor(held, "preview").show, "a confirmed, published legal_hold entry still never shows");
const pub = { status: "confirmed", publish: true, amount: 80, display: "$80" };
ok(P.priceFor(pub, "production").show && !P.priceFor(pub, "production").draft, "confirmed + published shows untagged in production");
ok(!P.priceFor({ status: "confirmed", publish: true, amount: 0 }, "production").show, "amount 0 never shows");

// 4. fullVsParts: null unless all three pass the gate AND front + rear === full.
CLASSES.forEach((c) => ok(P.fullVsParts(pricing, c, "production") === null, "fullVsParts production " + c + " is null today"));
const fvCar = P.fullVsParts(pricing, "car", "preview");
ok(fvCar && fvCar.front.amount + fvCar.rear.amount === fvCar.full.amount && fvCar.draft === true, "fullVsParts preview car sums and is tagged");
ok(P.fullVsParts(pricing, "van", "preview") === null, "fullVsParts van null (no van prices)");
const bad = clone(pricing);
bad.auto_tint.coverage.full_vehicle.car.amount = 330;
ok(P.fullVsParts(bad, "car", "preview") === null, "fullVsParts null when the sum does not match (no implied saving)");
const mix = clone(pricing);
Object.assign(mix.auto_tint.coverage.two_front_doors.car, { status: "confirmed", publish: true });
ok(P.fullVsParts(mix, "car", "production") === null, "fullVsParts null in production when only one of three is published");
const allPub = clone(pricing);
["two_front_doors", "rear_doors_and_back_glass", "full_vehicle"].forEach((k) => Object.assign(allPub.auto_tint.coverage[k].car, { status: "confirmed", publish: true }));
const fvPub = P.fullVsParts(allPub, "car", "production");
ok(fvPub && fvPub.draft === false && fvPub.full.money === "$350", "fullVsParts shows in production once all three are confirmed and published");

// 5. Presets: drafts absent in production, tagged on preview; illegal or unknown presets never show.
ok(P.presetFor(pricing, "production").length === 0, "no preset in production today (all draft)");
const pv = P.presetFor(pricing, "preview");
ok(pv.length === 3 && pv.every((p) => p.draft === true), "preview shows the 3 draft presets, tagged");
ok(P.defaultPreset(pricing, "production") === null && P.defaultPreset(pricing, "preview") === null, "no default preset (owner has not named one)");
const pz = clone(pricing);
pz.presets.push({ id: "dark-front", label: "Dark fronts", panels: { "front-doors": 20 }, status: "confirmed", publish: true });
pz.presets.push({ id: "full-ws", label: "Windshield", panels: { "full-windshield": 35 }, status: "confirmed", publish: true });
pz.presets.push({ id: "empty", label: "Empty", panels: {}, status: "confirmed", publish: true });
ok(P.presetFor(pz, "production").length === 0 && P.presetFor(pz, "preview").every((p) => ["dark-front", "full-ws", "empty"].indexOf(p.id) < 0), "illegal, unknown-panel and empty presets never show");
const pc = clone(pricing);
Object.assign(pc.presets[0], { status: "confirmed", publish: true });
pc.default_preset = pc.presets[0].id;
ok(P.presetFor(pc, "production").length === 1 && P.presetFor(pc, "production")[0].draft === false, "a confirmed, published preset shows in production");
ok(P.defaultPreset(pc, "production") === pc.presets[0].id, "default preset honored only when it passes");
pc.default_preset = "full";
ok(P.defaultPreset(pc, "production") === null, "default preset that does not pass is ignored");

// 6. Add-ons.
const ts = pricing.addons.find((a) => a.id === "top-strip");
const sr = pricing.addons.find((a) => a.id === "sunroof");
ok(P.entryAt(pricing, ts.price_ref) && P.entryAt(pricing, sr.price_ref), "add-on price_ref keys exist in auto_tint.panels");
ok(P.addonFor(pricing, ts, "car", "production").state === "ask", "top strip in production: Also ask about");
ok(P.addonFor(pricing, ts, "car", "preview").state === "priced" && P.addonFor(pricing, ts, "car", "preview").draft, "top strip on preview: priced, tagged");
ok(P.addonFor(pricing, sr, "pickup", "preview").state === "hidden", "pickup sunroof hidden (no recorded price)");
ok(P.addonFor(pricing, sr, "suv", "production").state === "ask", "SUV sunroof in production: Also ask about");

// 7. quoteFor never gives a partial total.
ok(!P.quoteFor(pricing, "car", ["front-doors", "rear-doors", "back-glass"], "production").show, "production builder total hidden today");
const q = P.quoteFor(pricing, "car", ["front-doors", "rear-doors", "back-glass"], "preview");
ok(q.show && q.display === "From $350" && q.draft, "preview full car is one package From $350, tagged");
const q2 = P.quoteFor(pricing, "car", ["front-doors", "rear-doors", "back-glass", "windshield-strip"], "preview");
ok(q2.show && q2.display === "From $425" && q2.parts.length === 2, "preview full car plus strip adds the two lines: " + q2.display);
ok(!P.quoteFor(pricing, "car", ["rear-doors"], "preview").show, "rear doors alone cannot be priced exactly, so no total");
ok(!P.quoteFor(pricing, "van", ["front-doors"], "preview").show, "van has no prices, so no total");
ok(P.displayOf({ amount: 150, range: [150, 250] }) === "Typically $150 to $250", "range display");

// 8. Shades and the builder data, both modes: no front shade below 35, no draft leak in production.
ok(P.shadesFor(pricing, "front").every((s) => s.vlt >= 35), "shadesFor front >= 35 (example shades)");
const stocked = clone(pricing); stocked.shades_installed = [5, 15, 20, 35, 50];
ok(P.shadesFor(stocked, "front").map((s) => s.vlt).join() === "50,35", "shadesFor front with a stocked list keeps only 50 and 35");
ok(P.shadesFor(stocked, "rear").every((s) => s.confirmed), "stocked shades are confirmed");
const low = clone(pricing); low.front_min_vlt = 20;
ok(P.shadesFor(low, "front").every((s) => s.vlt >= 35), "front_min_vlt in data can never lower the legal line");

["production", "preview"].forEach((mode) => {
  [pricing, stocked].forEach((pr, i) => {
    const cfg = builderConfig(pr, pg, mode);
    const label = mode + (i ? " stocked" : " example");
    ok(cfg.shades.front.length > 0 && cfg.shades.front.every((s) => s.v >= 35), label + ": builder front shades all >= 35");
    ok(cfg.presets.every((p) => p.set.front === undefined || p.set.front === "x" || p.set.front >= 35), label + ": presets never set a front below 35");
    const json = JSON.stringify(cfg);
    if (mode === "production") {
      ok(json.indexOf('"status":"draft"') < 0, label + ': 0 "status":"draft" in builder data');
      ok(!/\$\d/.test(json), label + ": 0 dollar amounts in builder data");
      ok(cfg.presets.length === 0, label + ": 0 presets in builder data");
      ok(json.indexOf("Draft price") < 0, label + ': 0 "Draft price" text in builder data');
    }
    ok(!/\b(save|saving|bundle|deal)\b/i.test(json), label + ": no save, bundle or deal words in builder data");
    ok(json.indexOf("full_windshield") < 0, label + ": full windshield film absent from builder data");
    ok(!i ? cfg.shades.rear.every((s) => !s.num && !/\d/.test(s.name)) : cfg.shades.rear.every((s) => s.num && /%$/.test(s.name)), label + ": shade numbers only when confirmed");
  });
});

console.log((fail ? "FAILED" : "PASSED") + ": " + pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;
