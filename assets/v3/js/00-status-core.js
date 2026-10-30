/* BC Glass & Tint v3, status core (WS2). One pure source of truth for "is the shop open", used by
   the browser (30-actions.js paints every status word and every booking control from one call)
   and by tests\status.test.js (Node). UMD: no DOM, no globals, no network.

   Loaded first in the core bundle on purpose (filename order: 00 before 20 and 30).

   statusAt(cfg, now) -> {
     state:    "open" | "closed" | "holiday" | "unknown",
     iso, weekday, minutes,           the shop-local calendar date, weekday name, minutes since midnight
     until:    { time } | null,       open state only, the closing time as "5 PM"
     nextOpen: { offset, dayLabel, dayName, iso, time } | null,
     reason:   string | null          holiday state only, from site.json closures
   }
   cfg is the object the layout prints once per page as <script id="bc-hours">:
     { tz, days[], opens "09:00", closes "17:00",
       closures[{date, reason}], unknown[{date, note}], texts_confirmed, labels }

   Rules (blueprint 5.2, CEO ruling 2026-10-29):
   - OPEN        a listed weekday, from opens up to (not including) closes, not a closure.
   - HOLIDAY     today is in closures (the owner confirmed the shop is closed all day).
   - UNKNOWN     today is in unknown. It is NEVER open, never shows a status word, and the search
                 for the next open day STOPS at an unknown date, so no unknown day is ever named
                 and nothing is promised past one.
   - CLOSED      everything else.
   Calendar arithmetic is done on UTC noon dates, so a daylight saving change can never skip or
   repeat a day. "now" is any Date, or a number of milliseconds, or an ISO string. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BCStatus = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var SHORT = { Sunday: "Sun", Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat" };
  var SEARCH_DAYS = 21;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toMin(hhmm) {
    var p = String(hhmm == null ? "0:0" : hhmm).split(":");
    return (+p[0]) * 60 + (+p[1] || 0);
  }

  /* "09:00" -> "9 AM", "17:00" -> "5 PM", "09:30" -> "9:30 AM" (the blueprint's copy style) */
  function clock(hhmm) {
    var m = toMin(hhmm), h = Math.floor(m / 60), mm = m % 60;
    var suf = h >= 12 ? "PM" : "AM", h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (mm ? ":" + pad(mm) : "") + " " + suf;
  }

  function nowParts(now, tz) {
    var d = now instanceof Date ? now : new Date(now);
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    var o = {};
    f.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    var h = +o.hour; if (h === 24) h = 0;
    return { y: +o.year, mo: +o.month, d: +o.day, min: h * 60 + (+o.minute) };
  }

  function dayInfo(base, offset) {
    var t = new Date(Date.UTC(base.y, base.mo - 1, base.d + offset, 12));
    var iso = t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
    return { iso: iso, name: WEEK[t.getUTCDay()] };
  }

  /* find a date in a list of {date} objects or plain "YYYY-MM-DD" strings; returns the entry or null */
  function find(list, iso) {
    list = list || [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if ((v && typeof v === "object" ? v.date : v) === iso) return typeof v === "object" ? v : { date: v };
    }
    return null;
  }

  function statusAt(cfg, now) {
    cfg = cfg || {};
    var tz = cfg.tz || "America/Los_Angeles";
    var days = cfg.days || [];
    var openM = toMin(cfg.opens), closeM = toMin(cfg.closes);
    var n = nowParts(now, tz), today = dayInfo(n, 0);
    var out = { state: "closed", iso: today.iso, weekday: today.name, minutes: n.min, until: null, nextOpen: null, reason: null };

    function openDay(info) { return days.indexOf(info.name) > -1 && !find(cfg.closures, info.iso); }

    function nextOpen() {
      for (var i = 0; i <= SEARCH_DAYS; i++) {
        var info = dayInfo(n, i);
        if (find(cfg.unknown, info.iso)) return null;       /* never name or pass an unknown day */
        if (!openDay(info)) continue;
        if (i === 0 && n.min >= openM) continue;            /* today's opening has already passed */
        return { offset: i, dayLabel: i === 0 ? "today" : info.name, dayName: info.name, iso: info.iso, time: clock(cfg.opens) };
      }
      return null;
    }

    if (find(cfg.unknown, today.iso)) { out.state = "unknown"; return out; }
    var closure = find(cfg.closures, today.iso);
    if (closure) {
      out.state = "holiday";
      out.reason = closure.reason || "";
      out.nextOpen = nextOpen();
      return out;
    }
    if (openDay(today) && n.min >= openM && n.min < closeM) {
      out.state = "open";
      out.until = { time: clock(cfg.closes) };
      return out;
    }
    out.nextOpen = nextOpen();
    return out;
  }

  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }

  var DEFAULT_LABELS = {
    open: "Open now until {close}",
    open_short: "Open",
    closed_short: "Closed",
    closed_next: "Closed now. Opens {day} at {open}.",
    closed_nonext: "Closed now.",
    holiday_next: "Closed for {reason}. Opens {day} at {open}.",
    holiday_nonext: "Closed for {reason}.",
    calls_open: "Calls open {day} at {open}",
    calls_open_short: "Calls open {day} {open}",
    days_short: SHORT
  };
  function label(labels, key) { return labels && labels[key] != null ? labels[key] : DEFAULT_LABELS[key]; }

  /* The words for a status. long and short are the chip text; calls and callsShort are the plain
     "when calls are answered" lines; show is false on an unknown day (no live status at all). */
  function describe(st, labels) {
    var res = { show: false, kind: "none", long: "", short: "", calls: "", callsShort: "" };
    if (!st || st.state === "unknown") return res;
    var no = st.nextOpen;
    if (no) {
      var shortDay = no.offset === 0 ? "today" : (label(labels, "days_short") || SHORT)[no.dayName] || no.dayName;
      res.calls = fill(label(labels, "calls_open"), { day: no.dayLabel, open: no.time });
      res.callsShort = fill(label(labels, "calls_open_short"), { day: shortDay, open: no.time });
    }
    if (st.state === "open") {
      res.show = true; res.kind = "open";
      res.long = fill(label(labels, "open"), { close: st.until.time });
      res.short = label(labels, "open_short");
      return res;
    }
    res.show = true; res.kind = "closed";
    res.short = label(labels, "closed_short");
    if (st.state === "holiday") {
      res.long = no
        ? fill(label(labels, "holiday_next"), { reason: st.reason, day: no.dayLabel, open: no.time })
        : fill(label(labels, "holiday_nonext"), { reason: st.reason });
    } else {
      res.long = no
        ? fill(label(labels, "closed_next"), { day: no.dayLabel, open: no.time })
        : label(labels, "closed_nonext");
    }
    return res;
  }

  /* Which control is the primary, which the secondary, and which plain note shows, per state.
     state   "open" | "closed" | "holiday" | "unknown" | "nojs"
     kind    "generic" (car, any) | "chip" | "home" | "build"
     texts   site.json texts_confirmed. While false, Text is NEVER the primary (CEO ruling).
     slot    "bar" turns the secondary into the plain note whenever the shop is not open
     hasNext whether a next open day is known (picks "calls" over "hours" for the note)
     onBook  true on /book itself: no Request a time anywhere (it would link to the page you are on),
             and no Text unless texts are confirmed; the secondary or primary is then "none"
     Returns { primary, secondary, note } with primary and secondary one of
     call | text | request | measure | note, and note one of none | calls | hours. */
  function plan(state, kind, texts, slot, hasNext, onBook) {
    var open = state === "open";
    var note = open ? "none" : (hasNext ? "calls" : "hours");
    var p, s;
    if (onBook) {
      if (state === "nojs") return { primary: "call", secondary: texts ? "text" : "none", note: "hours" };
      p = open ? "call" : (texts ? "text" : "none");
      s = open && texts ? "text" : "none";
      if (slot === "bar" && !open) s = "note";
      return { primary: p, secondary: s, note: note };
    }
    if (state === "nojs") { p = "call"; s = "text"; note = "hours"; }
    else if (kind === "home") { p = "measure"; s = open ? "call" : "text"; }
    else if (kind === "build") {
      if (open) { p = "call"; s = "request"; }
      else if (texts) { p = "text"; s = "request"; }
      else { p = "request"; s = "text"; }
    } else {
      if (open) { p = "call"; s = "text"; }
      else if (texts) { p = "text"; s = "request"; }
      else { p = "request"; s = "text"; }
    }
    if (slot === "bar" && !open && state !== "nojs") s = "note";
    return { primary: p, secondary: s, note: note };
  }

  /* Short printed hours from the same site data, e.g. { short: "Tue to Sat, 9 to 5",
     long: "Tuesday to Saturday, 9 to 5" }. Used for the no-JS line and the unknown-day line. */
  function hoursLine(cfg) {
    var days = (cfg && cfg.days) || [];
    var idx = days.map(function (d) { return WEEK.indexOf(d); }).filter(function (i) { return i > -1; });
    var contiguous = idx.length > 1 && idx.every(function (v, i) { return i === 0 || v === idx[i - 1] + 1; });
    var shortNames = days.map(function (d) { return SHORT[d] || d; });
    var dShort = contiguous ? shortNames[0] + " to " + shortNames[shortNames.length - 1] : shortNames.join(", ");
    var dLong = contiguous ? days[0] + " to " + days[days.length - 1] : days.join(", ");
    var o = toMin(cfg && cfg.opens), c = toMin(cfg && cfg.closes);
    function num(m) { var h = Math.floor(m / 60) % 12 || 12, mm = m % 60; return h + (mm ? ":" + pad(mm) : ""); }
    var times;
    if (o < 720 && c >= 720) times = num(o) + " to " + num(c);
    else times = clock(cfg && cfg.opens) + " to " + clock(cfg && cfg.closes);
    return { short: dShort + ", " + times, long: dLong + ", " + times, days_short: dShort, days_long: dLong, times: times };
  }

  return { statusAt: statusAt, describe: describe, plan: plan, hoursLine: hoursLine, clock: clock, fill: fill, nowParts: nowParts, dayInfo: dayInfo };
});
