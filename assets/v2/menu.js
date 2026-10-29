/* BC Glass & Tint v2: header menu drawer for phones and tablets.
   Opacity and transform only, 200 ms ease-out; instant under reduced motion. Escape closes it
   and returns focus to the button; it also closes if the window grows to the desktop nav. */
(function () {
  "use strict";
  var btn = document.getElementById("v2-menu-btn");
  var drawer = document.getElementById("v2-drawer");
  if (!btn || !drawer) return;
  var RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DESK = window.matchMedia ? window.matchMedia("(min-width: 1180px)") : null;
  var timer = null;

  function isOpen() { return btn.getAttribute("aria-expanded") === "true"; }
  function open() {
    clearTimeout(timer);
    drawer.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", btn.getAttribute("data-close-label") || "Close menu");
    requestAnimationFrame(function () { drawer.classList.add("is-open"); });
    var first = drawer.querySelector("a");
    if (first) first.focus({ preventScroll: true });
  }
  function close(refocus) {
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", btn.getAttribute("data-open-label") || "Menu");
    drawer.classList.remove("is-open");
    clearTimeout(timer);
    timer = setTimeout(function () { drawer.hidden = true; }, RM ? 0 : 220);
    if (refocus) btn.focus();
  }
  btn.addEventListener("click", function () { if (isOpen()) close(false); else open(); });
  drawer.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (a) close(false);
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Escape" || e.key === "Esc") && isOpen()) close(true);
  });
  if (DESK) {
    var onDesk = function () { if (DESK.matches && isOpen()) close(false); };
    if (DESK.addEventListener) DESK.addEventListener("change", onDesk); else if (DESK.addListener) DESK.addListener(onDesk);
  }
})();
