// WS2 status tests. Plain Node, no framework:   node tests\status.test.js
// Loads the SAME file the browser bundles (assets/v3/js/00-status-core.js), the real hours,
// closures and labels from _data/site.json and _data/pages/shared.json, and checks every case in
// engineering 6 (WS2 acceptance) plus the action plan table (texts_confirmed gate) and the printed
// hours line. Exit code 1 on any failure.
const fs = require("fs");
const path = require("path");
const core = require("../assets/v3/js/00-status-core.js");

const site = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "_data", "site.json"), "utf8"));
const shared = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "_data", "pages", "shared.json"), "utf8"));
const labels = shared.v3.status;
const cfg = {
  tz: site.hours.timezone,
  days: site.hours.days,
  opens: site.hours.opens,
  closes: site.hours.closes,
  closures: site.closures,
  unknown: site.hours_unknown,
  texts_confirmed: site.texts_confirmed
};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (detail !== undefined ? "   got: " + JSON.stringify(detail) : "")); }
}
function eq(name, got, want) { ok(name, JSON.stringify(got) === JSON.stringify(want), got); }

// "2026-11-26 10:00" as shop-local (America/Los_Angeles) time -> the real instant
function pt(s) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  for (const off of [7, 8]) {
    const t = new Date(Date.UTC(y, mo - 1, d, h + off, mi));
    const p = core.nowParts(t, cfg.tz);
    if (p.y === y && p.mo === mo && p.d === d && p.min === h * 60 + mi) return t;
  }
  throw new Error("no instant for " + s);
}
function at(s) {
  const st = core.statusAt(cfg, pt(s));
  const d = core.describe(st, labels);
  return { st, d };
}

console.log("Data (what the site prints)");
eq("closures are exactly the owner-confirmed days", site.closures.map((c) => c.date), ["2026-11-26", "2026-12-24", "2026-12-25", "2026-12-26"]);
eq("every closure has a reason", site.closures.every((c) => c.reason && c.reason.length > 2), true);
eq("only 2027-01-01 is unknown", site.hours_unknown.map((c) => c.date), ["2027-01-01"]);
eq("no date is both a closure and unknown", site.closures.filter((c) => site.hours_unknown.some((u) => u.date === c.date)).length, 0);
eq("texts_confirmed defaults to false", site.texts_confirmed, false);
eq("hours are Tue to Sat 09:00 to 17:00", [site.hours.days.join(","), site.hours.opens, site.hours.closes], ["Tuesday,Wednesday,Thursday,Friday,Saturday", "09:00", "17:00"]);

console.log("Open and closed edges");
{
  let r = at("2026-12-01 08:59"); // Tuesday
  eq("Tue 08:59 closed", r.st.state, "closed");
  eq("Tue 08:59 says Opens today at 9 AM", r.d.long, "Closed now. Opens today at 9 AM.");
  r = at("2026-12-01 09:00");
  eq("Tue 09:00 open", r.st.state, "open");
  eq("Tue 09:00 says until 5 PM", r.d.long, "Open now until 5 PM");
  eq("Tue 09:00 short word", r.d.short, "Open");
  r = at("2026-12-05 16:59"); // Saturday
  eq("Sat 16:59 open", r.st.state, "open");
  r = at("2026-12-05 17:00");
  eq("Sat 17:00 closed", r.st.state, "closed");
  eq("Sat 17:00 next open is Tuesday", [r.st.nextOpen.dayName, r.st.nextOpen.iso], ["Tuesday", "2026-12-08"]);
  eq("Sat 17:00 words", r.d.long, "Closed now. Opens Tuesday at 9 AM.");
  eq("Sat 17:00 calls line", r.d.calls, "Calls open Tuesday at 9 AM");
  eq("Sat 17:00 bar calls line", r.d.callsShort, "Calls open Tue 9 AM");
  r = at("2026-11-23 12:00"); // Monday
  eq("Mon 2026-11-23 noon closed", r.st.state, "closed");
  eq("Mon noon next open Tuesday 11-24", [r.st.nextOpen.dayName, r.st.nextOpen.iso], ["Tuesday", "2026-11-24"]);
  r = at("2026-12-06 12:00"); // Sunday
  eq("Sunday noon closed, next Tuesday", [r.st.state, r.st.nextOpen.dayName], ["closed", "Tuesday"]);
  r = at("2026-12-02 17:00"); // Wednesday after close
  eq("Wed 17:00 closed, opens Thursday", [r.st.state, r.st.nextOpen.dayName, r.st.nextOpen.offset], ["closed", "Thursday", 1]);
}

console.log("Holidays are closures with a reason");
{
  let r = at("2026-11-26 10:00"); // Thanksgiving, Thursday
  eq("Thu 2026-11-26 10:00 holiday", r.st.state, "holiday");
  eq("Thanksgiving words", r.d.long, "Closed for Thanksgiving. Opens Friday at 9 AM.");
  eq("Thanksgiving short word", r.d.short, "Closed");
  r = at("2026-11-27 10:00");
  eq("Fri 2026-11-27 is a normal open day", r.st.state, "open");
  r = at("2026-12-23 17:30"); // Wednesday evening before the closures
  eq("Wed 2026-12-23 17:30 closed", r.st.state, "closed");
  eq("next open skips Dec 24 to 26, Sunday and Monday: Tue Dec 29", [r.st.nextOpen.dayName, r.st.nextOpen.iso], ["Tuesday", "2026-12-29"]);
  eq("Dec 23 evening words", r.d.long, "Closed now. Opens Tuesday at 9 AM.");
  for (const [s, reason] of [["2026-12-24 10:00", "Christmas Eve"], ["2026-12-25 10:00", "Christmas Day"], ["2026-12-26 10:00", "the day after Christmas"]]) {
    r = at(s);
    eq(s + " holiday", [r.st.state, r.st.reason], ["holiday", reason]);
  }
  r = at("2026-12-26 10:00");
  eq("Dec 26 holiday names Tuesday as next open", r.d.long, "Closed for the day after Christmas. Opens Tuesday at 9 AM.");
  r = at("2026-11-26 03:00");
  eq("holiday is all day, even at 03:00", r.st.state, "holiday");
  r = at("2026-12-05 12:00");
  eq("Saturday Dec 5 is a normal open day", r.st.state, "open");
}

console.log("Unknown days are never open and never named");
{
  let r = at("2027-01-01 10:00"); // Friday
  eq("Fri 2027-01-01 10:00 unknown", r.st.state, "unknown");
  eq("unknown shows no status word at all", [r.d.show, r.d.long, r.d.short], [false, "", ""]);
  eq("unknown has no next open", r.st.nextOpen, null);
  eq("unknown is never 'open' at any hour of the day", [0, 3, 8, 9, 12, 16, 17, 23].every((h) => at("2027-01-01 " + String(h).padStart(2, "0") + ":00").st.state === "unknown"), true);
  r = at("2026-12-31 10:00"); // Thursday
  eq("Thu 2026-12-31 10:00 open", r.st.state, "open");
  r = at("2026-12-31 17:30"); // after close, next day is the unknown Jan 1
  eq("Dec 31 evening is closed", r.st.state, "closed");
  eq("Dec 31 evening: the unknown day is not named, nothing is promised", r.st.nextOpen, null);
  eq("Dec 31 evening words", r.d.long, "Closed now.");
  eq("Dec 31 evening: no 'calls open' promise", r.d.calls, "");
  r = at("2026-12-30 17:30");
  eq("Dec 30 evening: next open is Thursday Dec 31 (a known open day)", [r.st.nextOpen.dayName, r.st.nextOpen.iso], ["Thursday", "2026-12-31"]);
  // exhaustive: walking every half hour for 60 days, an unknown date is never open and never a nextOpen
  let bad = 0, n = 0;
  const unknownSet = new Set(site.hours_unknown.map((u) => u.date));
  const start = pt("2026-11-20 00:00").getTime();
  for (let i = 0; i < 60 * 48; i++) {
    const st = core.statusAt(cfg, new Date(start + i * 30 * 60 * 1000));
    n++;
    if (unknownSet.has(st.iso) && st.state !== "unknown") bad++;
    if (st.nextOpen && unknownSet.has(st.nextOpen.iso)) bad++;
    if (st.state === "open" && (unknownSet.has(st.iso) || site.closures.some((c) => c.date === st.iso))) bad++;
  }
  eq("exhaustive walk (" + n + " half hours): 0 unknown-as-open, 0 unknown-as-next, 0 closure-as-open", bad, 0);
}

console.log("Daylight saving weekend (2026-11-01, clocks go back)");
{
  let r = at("2026-11-01 12:00"); // Sunday
  eq("Sun 2026-11-01 noon closed", r.st.state, "closed");
  eq("next open is Tuesday 2026-11-03", [r.st.nextOpen.dayName, r.st.nextOpen.iso], ["Tuesday", "2026-11-03"]);
  r = at("2026-10-31 17:00"); // Saturday before the change
  eq("Sat 2026-10-31 17:00 closed, next Tuesday Nov 3", [r.st.state, r.st.nextOpen.iso], ["closed", "2026-11-03"]);
  r = at("2026-11-03 09:00");
  eq("Tue 2026-11-03 09:00 open (after the change)", r.st.state, "open");
  // the same instants through UTC: 08:59 PT Tuesday after DST ends is 16:59 UTC
  eq("08:59 PT after DST is closed", core.statusAt(cfg, new Date(Date.UTC(2026, 10, 3, 16, 59))).state, "closed");
  eq("09:00 PT after DST is open", core.statusAt(cfg, new Date(Date.UTC(2026, 10, 3, 17, 0))).state, "open");
  eq("09:00 PT before DST ends (PDT) is open", core.statusAt(cfg, new Date(Date.UTC(2026, 9, 27, 16, 0))).state, "open");
  // DST starts 2027-03-14; Tuesday 2027-03-16 09:00 PDT is 16:00 UTC
  eq("spring forward: Tue 2027-03-16 09:00 PDT open", core.statusAt(cfg, new Date(Date.UTC(2027, 2, 16, 16, 0))).state, "open");
  eq("spring forward: Tue 2027-03-16 08:59 PDT closed", core.statusAt(cfg, new Date(Date.UTC(2027, 2, 16, 15, 59))).state, "closed");
}

console.log("Primary action by state (texts_confirmed gate)");
{
  const P = (state, kind, texts, slot, next) => core.plan(state, kind, texts, slot, next);
  eq("open generic: call / text", P("open", "generic", false, "hero", false), { primary: "call", secondary: "text", note: "none" });
  eq("closed generic, texts NOT confirmed: request primary, text secondary", P("closed", "generic", false, "hero", true), { primary: "request", secondary: "text", note: "calls" });
  eq("closed generic, texts confirmed: text primary, request secondary", P("closed", "generic", true, "hero", true), { primary: "text", secondary: "request", note: "calls" });
  eq("holiday follows closed", P("holiday", "generic", false, "lane", true), { primary: "request", secondary: "text", note: "calls" });
  eq("unknown, texts NOT confirmed: request primary, hours note", P("unknown", "generic", false, "contact", false), { primary: "request", secondary: "text", note: "hours" });
  eq("unknown, texts confirmed: text primary", P("unknown", "generic", true, "contact", false), { primary: "text", secondary: "request", note: "hours" });
  eq("chip behaves like generic", P("closed", "chip", false, "hero", true), { primary: "request", secondary: "text", note: "calls" });
  eq("home: measure in every state (open)", P("open", "home", false, "lane", false), { primary: "measure", secondary: "call", note: "none" });
  eq("home: measure in every state (closed)", P("closed", "home", false, "lane", true), { primary: "measure", secondary: "text", note: "calls" });
  eq("home: measure in every state (unknown)", P("unknown", "home", false, "lane", false), { primary: "measure", secondary: "text", note: "hours" });
  eq("build open: call / request", P("open", "build", false, "builder", false), { primary: "call", secondary: "request", note: "none" });
  eq("build closed, texts NOT confirmed: request / text", P("closed", "build", false, "builder", true), { primary: "request", secondary: "text", note: "calls" });
  eq("build closed, texts confirmed: text / request", P("closed", "build", true, "builder", true), { primary: "text", secondary: "request", note: "calls" });
  eq("bar open: call / text button", P("open", "generic", false, "bar", false), { primary: "call", secondary: "text", note: "none" });
  eq("bar closed: secondary is the plain note", P("closed", "generic", false, "bar", true), { primary: "request", secondary: "note", note: "calls" });
  eq("bar unknown: secondary is the plain hours note", P("unknown", "generic", true, "bar", false), { primary: "text", secondary: "note", note: "hours" });
  // the gate, exhaustively: with texts_confirmed false, Text is never a primary in any state, kind or slot
  let leaks = 0;
  for (const state of ["open", "closed", "holiday", "unknown", "nojs"])
    for (const kind of ["generic", "chip", "home", "build"])
      for (const slot of ["hero", "lane", "price", "builder", "contact", "bar", "drawer"])
        for (const next of [true, false])
          if (P(state, kind, false, slot, next).primary === "text") leaks++;
  eq("texts_confirmed false: 0 of 280 combinations make Text the primary", leaks, 0);
  // and a tel: link is the primary only when the shop is open (or in the no-JS state)
  let telLeaks = 0;
  for (const state of ["closed", "holiday", "unknown"])
    for (const kind of ["generic", "chip", "home", "build"])
      for (const texts of [true, false])
        if (P(state, kind, texts, "hero", true).primary === "call") telLeaks++;
  eq("closed, holiday, unknown: 0 combinations make Call the primary", telLeaks, 0);
}

console.log("On /book (on_book): no Request a time, no Text while texts are unconfirmed");
{
  const B = (state, texts, slot, next) => core.plan(state, "generic", texts, slot, next, true);
  eq("open, texts NOT confirmed: call only", B("open", false, "contact", false), { primary: "call", secondary: "none", note: "none" });
  eq("open, texts confirmed: call, text", B("open", true, "contact", false), { primary: "call", secondary: "text", note: "none" });
  eq("closed, texts NOT confirmed: nothing but the note", B("closed", false, "contact", true), { primary: "none", secondary: "none", note: "calls" });
  eq("closed, texts confirmed: text only", B("closed", true, "contact", true), { primary: "text", secondary: "none", note: "calls" });
  eq("unknown, texts NOT confirmed: nothing but the hours note", B("unknown", false, "contact", false), { primary: "none", secondary: "none", note: "hours" });
  eq("bar closed: the note", B("closed", false, "bar", true), { primary: "none", secondary: "note", note: "calls" });
  eq("no-JS state: call, no text while unconfirmed", B("nojs", false, "contact", false), { primary: "call", secondary: "none", note: "hours" });
  let bad = 0;
  for (const state of ["open", "closed", "holiday", "unknown", "nojs"])
    for (const texts of [true, false])
      for (const slot of ["contact", "bar", "drawer"])
        for (const next of [true, false]) {
          const r = B(state, texts, slot, next);
          if (r.primary === "request" || r.secondary === "request") bad++;
          if (!texts && (r.primary === "text" || r.secondary === "text")) bad++;
        }
  eq("on_book: 0 of 60 combinations show Request a time, or Text while texts are unconfirmed", bad, 0);
}

console.log("Printed hours and the clock");
{
  eq("hours line from site data", core.hoursLine(cfg).short, "Tue to Sat, 9 to 5");
  eq("hours line long", core.hoursLine(cfg).long, "Tuesday to Saturday, 9 to 5");
  eq("clock 9 AM", core.clock("09:00"), "9 AM");
  eq("clock 5 PM", core.clock("17:00"), "5 PM");
  eq("clock 12 PM", core.clock("12:00"), "12 PM");
  eq("clock 9:30 AM", core.clock("09:30"), "9:30 AM");
  eq("clock midnight", core.clock("00:00"), "12 AM");
}

console.log("Characters in the labels a visitor reads");
{
  const text = JSON.stringify(shared.v3);
  ok("no em dash, en dash or non-ASCII in shared.json v3", !/[^\x00-\x7F]/.test(text));
  ok("no em dash or en dash in the closures reasons", !/[\u2013\u2014]/.test(JSON.stringify(site.closures)));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
