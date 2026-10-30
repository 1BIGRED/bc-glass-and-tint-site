/* BC Glass & Tint v3, header behavior. Phase A foundation (2026-10-29).
   Bundled into /assets/h/core.<hash>.js with every other *.js file in assets/v3/js, in filename
   order (keep the numeric prefixes; a pure status core must sort first, e.g. 00-status-core.js).
   1. Raised layer: an IntersectionObserver on the 1px sentinel at top 8px ([data-top-sentinel])
      toggles .is-raised on the header. No scroll listener. Where CSS scroll timelines exist the
      CSS animation drives the opacity and this class is only a state marker for tests; under
      reduced motion the class switches the layer instantly. data-raised="always" (front matter
      header_raised: true) keeps it on from load.
   2. Menu sheet (moved over from assets/v2/menu.js): disclosure button, Menu / Close word,
      Escape closes and returns focus, closes when the window grows to the desktop nav, and
      keeps Tab inside the button and the sheet while open (art direction H-f).
   3. One gold fill per view (art direction H-c): while an in-page gold control
      ([data-gold-zone]) is on screen, the header call goes to outline (.is-quiet). */
(function () {
  "use strict";
  var header = document.querySelector("[data-v3-header]");
  if (!header) return;
  var hasIO = "IntersectionObserver" in window;

  /* 1. raised layer */
  if (header.getAttribute("data-raised") === "always") {
    header.classList.add("is-raised");
  } else {
    var sentinel = document.querySelector("[data-top-sentinel]");
    if (!sentinel || !hasIO) {
      header.classList.add("is-raised");
    } else {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        header.classList.toggle("is-raised", !e.isIntersecting);
      }, { threshold: 0 }).observe(sentinel);
    }
  }

  /* 2. menu sheet */
  var btn = document.getElementById("v3-menu-btn");
  var drawer = document.getElementById("v3-drawer");
  if (btn && drawer) {
    var RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var DESK = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null;
    var label = btn.querySelector(".v3-menubtn__t");
    var timer = null;
    var isOpen = function () { return btn.getAttribute("aria-expanded") === "true"; };
    var setWord = function (open) {
      if (label) label.textContent = btn.getAttribute(open ? "data-close-label" : "data-open-label") || (open ? "Close" : "Menu");
    };
    var focusables = function () {
      return [btn].concat(Array.prototype.slice.call(drawer.querySelectorAll("a[href], button:not([disabled])")));
    };
    var openDrawer = function () {
      clearTimeout(timer);
      drawer.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      setWord(true);
      header.classList.add("is-menu");
      document.documentElement.classList.add("v3-menu-open");
      requestAnimationFrame(function () { drawer.classList.add("is-open"); });
      var first = drawer.querySelector("a[href]");
      if (first) first.focus({ preventScroll: true });
    };
    var closeDrawer = function (refocus) {
      btn.setAttribute("aria-expanded", "false");
      setWord(false);
      drawer.classList.remove("is-open");
      document.documentElement.classList.remove("v3-menu-open");
      clearTimeout(timer);
      timer = setTimeout(function () {
        drawer.hidden = true;
        header.classList.remove("is-menu");
      }, RM ? 0 : 220);
      if (refocus) btn.focus();
    };
    btn.addEventListener("click", function () { if (isOpen()) closeDrawer(false); else openDrawer(); });
    drawer.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (a) closeDrawer(false);
    });
    document.addEventListener("keydown", function (e) {
      if (!isOpen()) return;
      if (e.key === "Escape" || e.key === "Esc") { closeDrawer(true); return; }
      if (e.key === "Tab") {
        var list = focusables();
        var i = list.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
        else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
        else if (i === -1) { e.preventDefault(); list[0].focus(); }
      }
    });
    if (DESK) {
      var onDesk = function () { if (DESK.matches && isOpen()) closeDrawer(false); };
      if (DESK.addEventListener) DESK.addEventListener("change", onDesk); else if (DESK.addListener) DESK.addListener(onDesk);
    }
  }

  /* 3. quiet header call while an in-page gold control is visible */
  var zones = document.querySelectorAll("[data-gold-zone]");
  if (zones.length && hasIO) {
    var seen = new Map();
    var quietIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen.set(e.target, e.isIntersecting); });
      var any = false;
      seen.forEach(function (v) { if (v) any = true; });
      header.classList.toggle("is-quiet", any);
    }, { threshold: 0 });
    for (var i = 0; i < zones.length; i++) quietIO.observe(zones[i]);
  }
})();
