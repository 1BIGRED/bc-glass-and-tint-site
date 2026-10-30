/* BC Glass & Tint v3, gallery search and in-place filters (WS5). Page bundle "gallery".
   Without JavaScript: every photo shows, service and vehicle filters are real links, and the
   search box and the windows and look chips stay hidden (rendered with the hidden attribute).
   With JavaScript: search by make, model or service (data-q), and toggle the windows and look chips
   (one value per group; tap again to clear). Changes are instant: no animated reflow (art
   direction 3.5). The count is announced through an aria-live line. The booking strips hide while
   a filter is active so the grid reads straight. */
(function () {
  "use strict";
  var root = document.querySelector("[data-gallery]");
  if (!root) return;
  var grid = root.querySelector("[data-gal-grid]");
  var tiles = grid ? Array.prototype.slice.call(grid.querySelectorAll(".ws5-gt")) : [];
  var strips = grid ? Array.prototype.slice.call(grid.querySelectorAll("[data-gal-strip]")) : [];
  var status = root.querySelector("[data-gal-status]");
  var empty = root.querySelector("[data-gal-empty]");
  var reset = root.querySelector("[data-gal-reset]");
  var search = root.querySelector("[data-gal-search]");
  var input = root.querySelector("#gal-q");
  var clear = root.querySelector("[data-gal-clear]");
  var note = root.querySelector("[data-gal-lnote]");
  var groups = Array.prototype.slice.call(root.querySelectorAll("[data-gal-group]"));
  var state = { q: "", windows: "", look: "" };

  if (!tiles.length) return;
  // Peak pass R1 (technical 3): the search box, the windows and look rows and the note are marked
  // data-js-only and shown from first paint by the html.js class set in the head, so nothing above the
  // grid appears late (CLS). Clearing a leftover hidden attribute stays harmless.
  if (search) search.hidden = false;
  groups.forEach(function (g) { g.hidden = false; });
  if (note) note.hidden = false;

  /* Photo viewer (peak pass R1, visual G1). A native modal <dialog>: the browser keeps focus inside it
     and closes it on Escape. Left and right arrows page through the photos the filters still show;
     focus goes back to the tile that opened it. The enlarged image is the tile's own <picture>, cloned
     with sizes for the dialog, so it uses the larger files already built (up to 1280 px). Alt text and
     the caption come from the tile. No motion under reduced motion (CSS). */
  var viewer = root.querySelector("[data-gal-viewer]");
  if (viewer && typeof viewer.showModal === "function") {
    var vImg = viewer.querySelector("[data-gal-vimg]");
    var vTitle = viewer.querySelector("[data-gal-vtitle]");
    var vAlt = viewer.querySelector("[data-gal-valt]");
    var vCount = viewer.querySelector("[data-gal-vcount]");
    var countTpl = viewer.getAttribute("data-count") || "{n} of {total}";
    var current = -1;
    var opener = null;
    var SIZES = "(min-width: 1312px) 1280px, calc(100vw - 32px)";
    function visible() { return tiles.filter(function (t) { return !t.hidden; }); }
    function show(tile) {
      var list = visible();
      current = list.indexOf(tile);
      var pic = tile.querySelector("picture");
      var img = pic ? pic.querySelector("img") : null;
      vImg.textContent = "";
      if (pic) {
        var copy = pic.cloneNode(true);
        Array.prototype.forEach.call(copy.querySelectorAll("source"), function (s) { s.setAttribute("sizes", SIZES); });
        var ci = copy.querySelector("img");
        if (ci) { ci.setAttribute("sizes", SIZES); ci.removeAttribute("loading"); ci.removeAttribute("style"); ci.setAttribute("decoding", "async"); }
        vImg.appendChild(copy);
      }
      var t = tile.querySelector(".ws5-gt__t");
      vTitle.textContent = t ? t.textContent : "";
      vAlt.textContent = img ? img.getAttribute("alt") : "";
      vCount.textContent = countTpl.replace("{n}", String(current + 1)).replace("{total}", String(list.length));
    }
    function step(d) {
      var list = visible();
      if (!list.length) return;
      var i = (current + d + list.length) % list.length;
      show(list[i]);
    }
    root.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("[data-gal-open]") : null;
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
      e.preventDefault();
      opener = a;
      show(a.closest(".ws5-gt"));
      viewer.showModal();
      var closeBtn = viewer.querySelector("[data-gal-close]");
      if (closeBtn) closeBtn.focus();
    });
    viewer.querySelector("[data-gal-prev]").addEventListener("click", function () { step(-1); });
    viewer.querySelector("[data-gal-next]").addEventListener("click", function () { step(1); });
    viewer.querySelector("[data-gal-close]").addEventListener("click", function () { viewer.close(); });
    viewer.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "Tab") {
        // Keep Tab inside the viewer: a modal dialog makes the page inert, but Chrome still lets Tab
        // leave the last control for the browser's own UI. Wrap between the first and last control.
        var f = Array.prototype.slice.call(viewer.querySelectorAll("button"));
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || !viewer.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !viewer.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    });
    // A click on the backdrop (outside the panel) closes it, as on every photo viewer.
    viewer.addEventListener("click", function (e) { if (e.target === viewer) viewer.close(); });
    viewer.addEventListener("close", function () {
      vImg.textContent = "";
      var list = visible();
      var back = list[current] ? list[current].querySelector("[data-gal-open]") : opener;
      if (back && back.focus) back.focus();
    });
  }

  function words(s) { return String(s || "").toLowerCase().split(/\s+/).filter(Boolean); }

  function apply() {
    var terms = words(state.q);
    var shown = 0;
    tiles.forEach(function (t) {
      var q = t.getAttribute("data-q") || "";
      var ok = terms.every(function (w) { return q.indexOf(w) > -1; });
      if (ok && state.windows) ok = t.getAttribute("data-windows") === state.windows;
      if (ok && state.look) ok = t.getAttribute("data-look") === state.look;
      t.hidden = !ok;
      if (ok) shown++;
    });
    var active = !!(state.q || state.windows || state.look);
    strips.forEach(function (s) { s.hidden = active; });
    if (status) {
      var tpl = shown === 0 ? status.getAttribute("data-zero") : shown === 1 ? status.getAttribute("data-one") : status.getAttribute("data-many");
      status.textContent = String(tpl).replace("{n}", shown);
    }
    if (empty) empty.hidden = shown !== 0;
    if (reset) reset.hidden = !active;
    if (clear) clear.hidden = !state.q;
  }

  if (input) input.addEventListener("input", function () { state.q = input.value; apply(); });
  if (clear) clear.addEventListener("click", function () { input.value = ""; state.q = ""; apply(); input.focus(); });
  groups.forEach(function (g) {
    var key = g.getAttribute("data-gal-group");
    g.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button[data-val]") : null;
      if (!btn) return;
      var val = btn.getAttribute("data-val");
      state[key] = state[key] === val ? "" : val;
      Array.prototype.forEach.call(g.querySelectorAll("button[data-val]"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-val") === state[key] ? "true" : "false");
      });
      apply();
    });
  });
  if (reset) reset.addEventListener("click", function () {
    state = { q: "", windows: "", look: "" };
    if (input) input.value = "";
    groups.forEach(function (g) { Array.prototype.forEach.call(g.querySelectorAll("button[data-val]"), function (b) { b.setAttribute("aria-pressed", "false"); }); });
    apply();
  });
})();
