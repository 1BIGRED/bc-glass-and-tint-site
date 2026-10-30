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
   plain links. The listener lives in the builder bundle (builder/40-actions-build.js, peak R1).

   Phone bar (art direction CB-e): hidden while a text field has focus (the on-screen keyboard is
   open), while any in-page gold primary ([data-gold-fill], e.g. the request form's own submit
   button) has any part on screen, and while the builder's total bar is pinned (bc:bar-yield).

   FIXES-A (2026-10-29): the bar and the menu sheet carry the build on the builder page; they carry
   the page's one service when the page has one; one gold fill per screen is enforced on tablet and
   desktop (data-quiet); on phones the in-page copy of the bar's own action is hidden by CSS. */
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
      /* Peak R1 (CEO ruling): while texts are unconfirmed the macro prints no Text variant, so a
         planned Text secondary becomes Request a time where this slot has one, else nothing. */
      if (!texts && p.secondary === "text") {
        p = { primary: p.primary, secondary: p.primary !== "request" && el.querySelector('.v3-act__s [data-v="request"]') ? "request" : "none", note: p.note };
      }
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

  /* The pinned controls (phone bar, menu sheet) link Request a time to /book. When every in-page
     action on the page is for one service (a chip page, the builder), they carry that service too,
     /book?s=chip, so the request form opens on it (FIXES-A: the in-page duplicate of the bar's
     Request a time is hidden on phones, and its ?s= must not be lost with it). */
  var PINNED = '[data-bc-act][data-slot="bar"], [data-bc-act][data-slot="drawer"]';
  (function pinnedService() {
    var acts = document.querySelectorAll("[data-bc-act]"), svc = null, i, s, slot;
    for (i = 0; i < acts.length; i++) {
      slot = acts[i].getAttribute("data-slot");
      if (slot === "bar" || slot === "drawer" || slot === "header") continue;
      if (acts[i].getAttribute("data-kind") === "home") return;
      s = acts[i].getAttribute("data-service") || "any";
      if (s === "any") return;
      if (svc && s !== svc) return;
      svc = s;
    }
    if (!svc) return;
    var links = document.querySelectorAll(PINNED.split(", ").map(function (p) { return p + ' a[data-act="request"]'; }).join(", "));
    for (i = 0; i < links.length; i++) {
      var h = links[i].getAttribute("href") || "";
      if (h.indexOf("?") > -1) continue;
      links[i].setAttribute("href", h + "?s=" + encodeURIComponent(svc));
      links[i].removeAttribute("data-href0");
    }
  })();

  /* Build hand-off (FIXES-A item 1): the code is carried into the request and text links of the
     builder's own action and of the pinned controls by assets/v3/js/builder/40-actions-build.js,
     which ships only with the builder (peak R1: builder-only code out of the core bundle). */

  /* One gold fill per screen on tablet and desktop (art direction C1, V5; FIXES-A item 7). From
     768px wide and 481px tall the in-page booking buttons (hero, lane, contact, builder) are gold.
     When two of them, or one and a request form's own submit ([data-gold-fill]), are on screen at
     the same time, only one stays gold: the form's submit first, else the one highest on screen.
     The others get data-quiet and show as an outline (a color change only, no size change, so
     nothing moves). One IntersectionObserver, no scroll listener. Under 768px the pinned bar is the
     one gold fill and the in-page buttons are outlines already, so nothing is marked there. */
  (function oneGold() {
    if (!("IntersectionObserver" in window) || !window.matchMedia) return;
    var mq = window.matchMedia("(min-width: 768px) and (min-height: 481px)");
    var acts = Array.prototype.slice.call(document.querySelectorAll("[data-bc-act][data-gold-zone]")).filter(function (el) {
      var s = el.getAttribute("data-slot");
      return s !== "header" && s !== "drawer" && s !== "bar" && s !== "price";
    });
    var fills = Array.prototype.slice.call(document.querySelectorAll("[data-gold-fill]"));
    var all = fills.concat(acts);
    if (all.length < 2) return;
    var seen = [];
    function settle() {
      var keep = null, i;
      if (mq.matches) {
        var vis = seen.filter(function (el) { return el.offsetParent !== null || el.getClientRects().length > 0; });
        var f = vis.filter(function (el) { return fills.indexOf(el) > -1; });
        var pool = f.length ? f : vis;
        pool.forEach(function (el) { if (!keep || el.getBoundingClientRect().top < keep.getBoundingClientRect().top) keep = el; });
      }
      for (i = 0; i < all.length; i++) {
        var quiet = mq.matches && keep !== null && all[i] !== keep && seen.indexOf(all[i]) > -1;
        if (quiet) { if (!all[i].hasAttribute("data-quiet")) all[i].setAttribute("data-quiet", ""); }
        else if (all[i].hasAttribute("data-quiet")) all[i].removeAttribute("data-quiet");
      }
    }
    /* the observer watches the primary cell of each action (the gold button lives there) and each
       submit; an entry is mapped back to the action it belongs to */
    var ownerOf = function (t) { return fills.indexOf(t) > -1 ? t : (t.closest && t.closest("[data-bc-act]")) || t; };
    var io = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        var t = ownerOf(entries[k].target), at = seen.indexOf(t);
        if (entries[k].isIntersecting && at === -1) seen.push(t);
        else if (!entries[k].isIntersecting && at > -1) seen.splice(at, 1);
      }
      settle();
    }, { threshold: 0 });
    acts.forEach(function (el) { io.observe(el.querySelector(".v3-act__p") || el); });
    fills.forEach(function (el) { io.observe(el); });
    if (mq.addEventListener) mq.addEventListener("change", settle);
  })();

  /* Phone bar out of the way of the keyboard and of the request form's own button */
  var bar = document.querySelector("[data-bc-sticky]");
  if (bar) {
    var hideReasons = { kbd: false, form: false, pin: false };
    /* While the bar is away, <html data-bar-away> lets the cookie bar drop to the bottom edge
       (35-consent.css) instead of floating one bar height above it. */
    var sync = function () {
      var away = hideReasons.kbd || hideReasons.form || hideReasons.pin;
      bar.classList.toggle("is-away", away);
      if (away) root.setAttribute("data-bar-away", "");
      else root.removeAttribute("data-bar-away");
    };
    /* FIXES-A item 3: the builder's own pinned total bar (50-builder.js) asks the bar to step aside
       while it is pinned under the header, so the builder's pinned UI is that one 48px bar. The
       header call control stays a tel: link in every state. */
    document.addEventListener("bc:bar-yield", function (e) { hideReasons.pin = !!(e && e.detail && e.detail.on); sync(); });
    if (root.hasAttribute("data-bt-pinned")) { hideReasons.pin = true; sync(); }
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
    /* One gold fill per screen (art direction C1, V5; CEO ruling 2026-10-29, integration pass):
       while ANY in-page gold primary marked [data-gold-fill] (every request form's submit, and any
       future in-page gold control on phones) has any part on screen, the bar steps aside. The bar is
       position: fixed, so hiding it moves nothing in the page (no layout shift). No scroll listener:
       one IntersectionObserver, threshold 0. */
    if ("IntersectionObserver" in window) {
      var golds = document.querySelectorAll("[data-gold-fill]");
      if (golds.length) {
        var onScreen = [];
        var io = new IntersectionObserver(function (entries) {
          for (var k = 0; k < entries.length; k++) {
            var t = entries[k].target, at = onScreen.indexOf(t);
            if (entries[k].isIntersecting && at === -1) onScreen.push(t);
            else if (!entries[k].isIntersecting && at > -1) onScreen.splice(at, 1);
          }
          hideReasons.form = onScreen.length > 0;
          sync();
        }, { threshold: 0 });
        for (var g = 0; g < golds.length; g++) io.observe(golds[g]);
      }
    }
  }
})();
