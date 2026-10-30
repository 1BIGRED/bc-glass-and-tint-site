/* BC Glass & Tint v3, the action system (WS2). Bundled into /assets/h/core.<hash>.js after
   00-status-core.js (filename order), which provides window.BCStatus.

   ONE statusAt() call per paint drives everything on the page:
   - every [data-bc-status] (the header word, the menu sheet word, any chip a page prints) gets its
     text and .is-open / .is-closed / .is-ready, or nothing on an unknown day;
   - every [data-bc-act] (hero, lane, price, builder, contact, bar, drawer; not the fixed header
     call) gets data-state, data-primary, data-secondary and data-note from BCStatus.plan(), and its
     "Calls open Tuesday at 9 AM" note filled; 30-actions.css shows the variant that matches;
   - [data-bc-sticky] gets data-state; <html> gets data-status-state (open, closed, holiday,
     unknown), which events.js (WS3) reads as the status_state event parameter.
   Repaints every 60 s and when the tab becomes visible again. The server prints the no-JS state, so
   until this runs a visitor sees Call and Text with the hours printed and no status claim.

   Test clock. Only when the page carries [data-test-clock] on the call bar (every build except
   Netlify CONTEXT=production, lib/eleventy-ws2.js): window.BC_NOW (a Date, milliseconds or an ISO
   string with an offset) or the query ?bcnow=2026-11-26T10:00:00-08:00 replaces "now", and
   window.bcActions.repaint() repaints. A production page ignores both.

   Build hand-off (WS4, builder.js): document.dispatchEvent(new CustomEvent("bc:build",
   { detail: { code: "BC-S3520T", summary: "SUV. Front doors 35." } })). Every [data-build] control
   then links with the build: Request a time to /book?s=car&b=BC-S3520T, Text this build to an sms:
   link whose body is the labelled sentence plus the summary. A detail with no code restores the
   plain links.

   Phone bar (art direction CB-e): hidden while a text field has focus (the on-screen keyboard is
   open) and while the request form's own submit button is on screen. */
(function () {
  "use strict";
  var core = window.BCStatus;
  var src = document.getElementById("bc-hours");
  if (!core || !src || !window.Intl || !Intl.DateTimeFormat) return;
  var cfg;
  try { cfg = JSON.parse(src.textContent); } catch (e) { return; }

  var root = document.documentElement;
  var hookOK = !!document.querySelector("[data-test-clock]");
  var texts = cfg.texts_confirmed === true;
  var NBSP = String.fromCharCode(160);

  function clockNow() {
    if (hookOK) {
      var v = window.BC_NOW;
      if (v == null) {
        try { v = new URLSearchParams(window.location.search).get("bcnow"); } catch (e) { v = null; }
      }
      if (v != null && v !== "") {
        var t = v instanceof Date ? v.getTime() : (typeof v === "number" ? v : Date.parse(v));
        if (!isNaN(t)) return new Date(t);
      }
    }
    return new Date();
  }

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  /* a time never breaks from its AM or PM across two lines */
  function nb(v) { return v.replace(/([0-9]) (AM|PM)/g, "$1" + NBSP + "$2"); }
  function setText(el, value) {
    value = nb(value);
    if (el && el.textContent !== value) el.textContent = value;
  }

  function paint() {
    var st = core.statusAt(cfg, clockNow());
    var d = core.describe(st, cfg.labels);
    var hasNext = !!st.nextOpen;
    var i;

    setAttr(root, "data-status-state", st.state);

    var chips = document.querySelectorAll("[data-bc-status]");
    for (i = 0; i < chips.length; i++) {
      var chip = chips[i], txt = chip.querySelector(".v3-status__txt");
      var long = chip.getAttribute("data-form") === "long";
      chip.classList.remove("is-open", "is-closed", "is-ready");
      if (!d.show) { setText(txt, ""); continue; }
      setText(txt, long ? d.long : d.short);
      chip.classList.add(d.kind === "open" ? "is-open" : "is-closed", "is-ready");
    }

    var acts = document.querySelectorAll("[data-bc-act]");
    for (i = 0; i < acts.length; i++) {
      var el = acts[i];
      if (el.getAttribute("data-fixed") === "true") continue;
      var slot = el.getAttribute("data-slot") || "lane";
      var p = core.plan(st.state, el.getAttribute("data-kind") || "generic", texts, slot, hasNext, el.getAttribute("data-on-book") === "true");
      setAttr(el, "data-state", st.state);
      setAttr(el, "data-primary", p.primary);
      setAttr(el, "data-secondary", p.secondary);
      setAttr(el, "data-note", p.note);
      setText(el.querySelector('[data-v="note-calls"]'), hasNext ? (slot === "bar" ? d.callsShort : d.calls) : "");
    }

    var bars = document.querySelectorAll("[data-bc-sticky]");
    for (i = 0; i < bars.length; i++) setAttr(bars[i], "data-state", st.state);
  }

  paint();
  setInterval(paint, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) paint(); });
  if (hookOK) window.bcActions = { repaint: paint };

  /* Build hand-off: carry the build code into the request and text links */
  function applyBuild(detail) {
    var code = detail && detail.code ? String(detail.code) : "";
    var summary = detail && detail.summary ? String(detail.summary) : "";
    var acts = document.querySelectorAll('[data-bc-act][data-build="true"]');
    for (var i = 0; i < acts.length; i++) {
      var el = acts[i];
      var body = (el.getAttribute("data-build-body") || "").replace("{code}", code);
      var links = el.querySelectorAll("a[data-act]");
      for (var j = 0; j < links.length; j++) {
        var a = links[j], kind = a.getAttribute("data-act");
        if (a.getAttribute("data-href0") == null) a.setAttribute("data-href0", a.getAttribute("href"));
        var base = a.getAttribute("data-href0");
        if (kind === "request") {
          a.setAttribute("href", code ? base + (base.indexOf("?") > -1 ? "&" : "?") + "b=" + encodeURIComponent(code) : base);
        } else if (kind === "text") {
          a.setAttribute("href", code ? "sms:" + base.replace(/^sms:/, "").split("?")[0] + "?&body=" + encodeURIComponent((body + (summary ? " " + summary : "")).trim()) : base);
        }
      }
    }
  }
  document.addEventListener("bc:build", function (e) { applyBuild(e && e.detail); });

  /* Phone bar out of the way of the keyboard and of the request form's own button */
  var bar = document.querySelector("[data-bc-sticky]");
  if (bar) {
    var hideReasons = { kbd: false, form: false };
    var sync = function () { bar.classList.toggle("is-away", hideReasons.kbd || hideReasons.form); };
    var isField = function (t) {
      if (!t || !t.tagName) return false;
      var tag = t.tagName.toLowerCase();
      if (tag === "textarea" || tag === "select") return true;
      if (tag !== "input") return false;
      var type = (t.getAttribute("type") || "text").toLowerCase();
      return ["button", "submit", "checkbox", "radio", "reset", "image", "hidden", "file", "range", "color"].indexOf(type) === -1;
    };
    document.addEventListener("focusin", function (e) { if (isField(e.target)) { hideReasons.kbd = true; sync(); } });
    document.addEventListener("focusout", function (e) { if (isField(e.target)) { hideReasons.kbd = false; sync(); } });
    if ("IntersectionObserver" in window) {
      var submit = document.querySelector('form[name="quote"] [type="submit"]');
      if (submit) {
        new IntersectionObserver(function (entries) {
          hideReasons.form = entries[entries.length - 1].isIntersecting;
          sync();
        }, { threshold: 0.5 }).observe(submit);
      }
    }
  }
})();
