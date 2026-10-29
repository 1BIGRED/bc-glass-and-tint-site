/* BC Glass & Tint v2: header behavior.
   1. Menu drawer for phones and tablets. Opacity and transform only, 200 ms ease-out; instant
      under reduced motion. The button's visible word swaps Menu / Close. Escape closes it and
      returns focus to the button; it also closes if the window grows to the desktop nav.
   2. Over-the-hero header (body.v2-overhero, the homepage): transparent while the hero is under
      it, then its ink background fades in (.is-solid). Opacity only, no size change, no shift.
   3. One gold fill per screen: while an in-page gold call ([data-gold-zone]) is on screen, the
      header's Call button goes to outline (.is-quiet). */
(function () {
  "use strict";
  var header = document.querySelector("[data-v2-header]");
  var btn = document.getElementById("v2-menu-btn");
  var drawer = document.getElementById("v2-drawer");
  var RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (btn && drawer) {
    var DESK = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null;
    var label = btn.querySelector(".v2-menubtn__t");
    var timer = null;
    var isOpen = function () { return btn.getAttribute("aria-expanded") === "true"; };
    var setWord = function (open) {
      if (label) label.textContent = btn.getAttribute(open ? "data-close-label" : "data-open-label") || (open ? "Close" : "Menu");
    };
    var openDrawer = function () {
      clearTimeout(timer);
      drawer.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      setWord(true);
      if (header) header.classList.add("is-menu");
      requestAnimationFrame(function () { drawer.classList.add("is-open"); });
      var first = drawer.querySelector("a");
      if (first) first.focus({ preventScroll: true });
    };
    var closeDrawer = function (refocus) {
      btn.setAttribute("aria-expanded", "false");
      setWord(false);
      drawer.classList.remove("is-open");
      clearTimeout(timer);
      timer = setTimeout(function () {
        drawer.hidden = true;
        if (header) header.classList.remove("is-menu");
      }, RM ? 0 : 220);
      if (refocus) btn.focus();
    };
    btn.addEventListener("click", function () { if (isOpen()) closeDrawer(false); else openDrawer(); });
    drawer.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (a) closeDrawer(false);
    });
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.key === "Esc") && isOpen()) closeDrawer(true);
    });
    if (DESK) {
      var onDesk = function () { if (DESK.matches && isOpen()) closeDrawer(false); };
      if (DESK.addEventListener) DESK.addEventListener("change", onDesk); else if (DESK.addListener) DESK.addListener(onDesk);
    }
  }

  if (!header || !("IntersectionObserver" in window)) {
    if (header) header.classList.add("is-solid");
    return;
  }

  /* 2. solid after the hero */
  if (document.body.classList.contains("v2-overhero")) {
    var hero = document.querySelector("[data-hero]");
    if (!hero) {
      header.classList.add("is-solid");
    } else {
      var hh = function () { return header.getBoundingClientRect().height || 64; };
      var solidIO = new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        header.classList.toggle("is-solid", !e.isIntersecting);
      }, { rootMargin: "-" + Math.round(hh() + 1) + "px 0px 0px 0px", threshold: 0 });
      /* watch a 1px line near the bottom of the hero: once it passes under the header, go solid */
      var mark = document.createElement("div");
      mark.setAttribute("aria-hidden", "true");
      mark.style.cssText = "position:absolute;left:0;right:0;bottom:25%;height:1px;pointer-events:none;visibility:hidden";
      hero.appendChild(mark);
      solidIO.observe(mark);
    }
  }

  /* 3. quiet header call while an in-page gold call is visible */
  var zones = document.querySelectorAll("[data-gold-zone]");
  if (zones.length) {
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
