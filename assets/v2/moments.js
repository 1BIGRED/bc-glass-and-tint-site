/* BC Glass & Tint v2: signature moments (CREATIVE-DIRECTION.md section 3).
   Moment 1, the Light-Down: the hero opens under a glare layer and settles to calm ONCE, on the
   first scroll or 600 ms after the hero photo has loaded, whichever comes first. The fade itself
   is a 600 ms CSS opacity transition (v2.css); this file only adds .is-calm. Nothing here
   touches the photo, so the photo stays the LCP. Under reduced motion the head script never
   sets html.ld-on, so the page is already calm and this does nothing.
   Also: opens the "Rather have us call you?" panel when the address points at #quote. */
(function () {
  "use strict";

  /* ---- Moment 1: the Light-Down ---- */
  var hero = document.querySelector("[data-lightdown]");
  var root = document.documentElement;
  if (hero && root.classList.contains("ld-on")) {
    var done = false;
    var calm = function () {
      if (done) return;
      done = true;
      window.removeEventListener("scroll", onScroll, { passive: true });
      requestAnimationFrame(function () { hero.classList.add("is-calm"); });
    };
    var onScroll = function () { if ((window.scrollY || window.pageYOffset || 0) > 4) calm(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    if ((window.scrollY || window.pageYOffset || 0) > 4) calm();
    var img = hero.querySelector("img");
    var later = function () { setTimeout(calm, 600); };
    if (!img || (img.complete && img.naturalWidth)) later();
    else {
      img.addEventListener("load", later, { once: true });
      img.addEventListener("error", calm, { once: true });
    }
  }

  /* ---- #quote lives inside the callback <details>: open it when it is the target ---- */
  var openFor = function (hash) {
    if (!hash || hash.length < 2) return;
    var el;
    try { el = document.querySelector(hash); } catch (e) { return; }
    if (!el) return;
    var d = el.closest ? el.closest("details") : null;
    if (d && !d.open) {
      d.open = true;
      el.scrollIntoView({ block: "start" });
    }
  };
  openFor(location.hash);
  window.addEventListener("hashchange", function () { openFor(location.hash); });
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="#"]') : null;
    if (!a) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.pathname === location.pathname && u.hash) openFor(u.hash);
  });
})();
