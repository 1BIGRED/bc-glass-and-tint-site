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
  if (search) search.hidden = false;
  groups.forEach(function (g) { g.hidden = false; });
  if (note) note.hidden = false;

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
