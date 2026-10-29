/* BC Glass & Tint v2: honest open or closed status.
   Reads the hours block the layout prints from _data/site.json (#bc-hours), works out the
   time in the shop's own time zone (America/Los_Angeles), and fills every [data-bc-status]
   element. The server renders no status text at all, so a visitor without JavaScript never
   sees a claim that might be wrong, and the space is reserved so nothing shifts.
   - closures: dates the shop is closed (holidays). Status says closed, next open day skips them.
   - hours_unknown: dates whose hours are not confirmed. On those days no status is shown, and
     "opens <day>" is never promised for one of them.
   When closed, the sticky phone bar gets data-state="closed" and TEXT becomes the primary. */
(function () {
  "use strict";
  var src = document.getElementById("bc-hours");
  if (!src || !window.Intl || !Intl.DateTimeFormat) return;
  var cfg;
  try { cfg = JSON.parse(src.textContent); } catch (e) { return; }

  var WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var tz = cfg.tz || "America/Los_Angeles";
  var days = cfg.days || [];
  var closures = cfg.closures || [];
  var unknown = cfg.unknown || [];
  var L = cfg.labels || {};

  function toMin(hhmm) { var p = String(hhmm || "0:0").split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  var openM = toMin(cfg.opens), closeM = toMin(cfg.closes);

  function clock(hhmm) {
    var m = toMin(hhmm), h = Math.floor(m / 60), mm = m % 60;
    var suf = h >= 12 ? "pm" : "am", h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (mm ? ":" + (mm < 10 ? "0" : "") + mm : "") + " " + suf;
  }

  function nowParts() {
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    var o = {};
    f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    var h = +o.hour; if (h === 24) h = 0;
    return { y: +o.year, mo: +o.month, d: +o.day, min: h * 60 + (+o.minute) };
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* Calendar arithmetic in UTC at noon, so a daylight saving change can never skip a date. */
  function dayInfo(base, offset) {
    var t = new Date(Date.UTC(base.y, base.mo - 1, base.d + offset, 12));
    var iso = t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
    return { iso: iso, name: WEEK[t.getUTCDay()] };
  }
  function listed(list, iso) {
    for (var i = 0; i < list.length; i++) {
      var v = list[i]; if ((v && v.date ? v.date : v) === iso) return true;
    }
    return false;
  }
  function openDay(info) { return days.indexOf(info.name) > -1 && !listed(closures, info.iso); }

  function compute() {
    var n = nowParts(), today = dayInfo(n, 0);
    if (listed(unknown, today.iso)) return null;
    if (openDay(today) && n.min >= openM && n.min < closeM) {
      return { open: true, text: (L.open || "Open now, until {close}").replace("{close}", clock(cfg.closes)) };
    }
    for (var i = 0; i <= 14; i++) {
      var info = dayInfo(n, i);
      if (i === 0 && n.min >= openM) continue;
      if (listed(unknown, info.iso)) break;
      if (openDay(info)) {
        var label = i === 0 ? (L.today || "today") : i === 1 ? (L.tomorrow || "tomorrow") : info.name;
        return { open: false, text: (L.closed_next || "Closed, opens {day} {open}").replace("{day}", label).replace("{open}", clock(cfg.opens)) };
      }
    }
    return { open: false, text: L.closed || "Closed now" };
  }

  function paint() {
    var s = compute();
    var els = document.querySelectorAll("[data-bc-status]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i], txt = el.querySelector(".v2-status__txt");
      el.classList.remove("is-open", "is-closed", "is-ready");
      if (!s) { if (txt) txt.textContent = ""; continue; }
      if (txt) txt.textContent = s.text;
      el.classList.add(s.open ? "is-open" : "is-closed", "is-ready");
    }
    var bars = document.querySelectorAll("[data-bc-sticky]");
    for (var j = 0; j < bars.length; j++) bars[j].setAttribute("data-state", s && !s.open ? "closed" : "open");
  }

  paint();
  setInterval(paint, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) paint(); });
})();
