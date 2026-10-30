/* BC Glass & Tint v3, gallery search, fitment-style filters and photo viewer (WS5; search pass
   2026-10-30, build log overhaul-v3/build-logs/GALLERY-SEARCH.md). Page bundle "gallery".
   Without JavaScript: every photo shows, service and vehicle filters are real links, and the search
   panel stays hidden (data-js-only, html:not(.js) hides it, html.js shows it from first paint, so
   nothing above the grid appears late).
   With JavaScript:
   - Text search over make, model, type, service, windows, look and the caption (data-q). Every word
     must match; "f150" finds "F-150".
   - Year, Make and Model selects cascade (Model lists only the chosen make's models; choosing a model
     picks its make). Each option shows how many photos it would leave given the other filters, and an
     option that would leave none is disabled.
   - Windows done (several at once: a photo must have all of them), look (one), front and rear shade
     (only printed when a record holds a shade).
   - Removable chips for each active filter, Clear all, a live count (aria-live), a calm empty state
     with the closest one-filter-less match.
   - The state lives in the URL (?q=&year=&make=&model=&win=&look=&sf=&sr=), so a filtered view is
     shareable and bookmarkable; the service and vehicle links carry it along, so /gallery/suv?look=dark
     is a pre-filtered entry point too.
   Changes are instant: no animated reflow (art direction 3.5). The booking strips hide while a
   filter is active so the grid reads straight. 20 tiles: one pass over cached tile data per change. */
(function () {
  "use strict";
  var root = document.querySelector("[data-gallery]");
  if (!root) return;
  var slice = Array.prototype.slice;
  var $ = function (sel) { return root.querySelector(sel); };
  var $$ = function (sel) { return slice.call(root.querySelectorAll(sel)); };
  var grid = $("[data-gal-grid]");
  var tileEls = grid ? slice.call(grid.querySelectorAll(".ws5-gt")) : [];
  var strips = grid ? slice.call(grid.querySelectorAll("[data-gal-strip]")) : [];
  var status = $("[data-gal-status]");
  var empty = $("[data-gal-empty]");
  var near = $("[data-gal-near]");
  var nearBtn = $("[data-gal-nearbtn]");
  var reset = $("[data-gal-reset]");
  var input = root.querySelector("#gal-q");
  var clear = $("[data-gal-clear]");
  var activeList = $("[data-gal-active]");
  var moreCount = $("[data-gal-morecount]");
  var carry = $$("[data-gal-carry]");
  var groups = $$("[data-gal-group]");
  var sels = {};
  $$("[data-gal-sel]").forEach(function (s) { sels[s.getAttribute("data-gal-sel")] = s; });

  // Peak pass R1 (technical 3): clearing a leftover hidden attribute on JS-only rows stays harmless.
  groups.forEach(function (g) { g.hidden = false; });

  var KEYS = ["q", "year", "make", "model", "win", "look", "sf", "sr"];
  var state = { q: "", year: "", make: "", model: "", win: [], look: "", sf: "", sr: "" };
  var norm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim(); };
  var words = function (s) { return norm(s).split(" ").filter(Boolean); };

  var tiles = tileEls.map(function (el) {
    var a = function (n) { return el.getAttribute("data-" + n) || ""; };
    return { el: el, q: " " + a("q") + " ", year: a("year"), make: a("make"), model: a("model"), win: " " + a("win") + " ", look: a("look"), sf: a("sf"), sr: a("sr") };
  });

  // skip: a dimension left out of the test (facet counts, closest match).
  function matches(t, st, skip) {
    if (skip !== "q" && st.q) {
      var ws = words(st.q);
      for (var i = 0; i < ws.length; i++) if (t.q.indexOf(ws[i]) < 0) return false;
    }
    if (skip !== "year" && st.year && t.year !== st.year) return false;
    if (skip !== "make" && skip !== "makemodel" && st.make && t.make !== st.make) return false;
    if (skip !== "model" && skip !== "makemodel" && st.model && t.model !== st.model) return false;
    if (skip !== "win") {
      for (var j = 0; j < st.win.length; j++) if (t.win.indexOf(" " + st.win[j] + " ") < 0) return false;
    }
    if (skip !== "look" && st.look && t.look !== st.look) return false;
    if (skip !== "sf" && st.sf && t.sf !== st.sf) return false;
    if (skip !== "sr" && st.sr && t.sr !== st.sr) return false;
    return true;
  }
  function count(st, skip) {
    var n = 0;
    for (var i = 0; i < tiles.length; i++) if (matches(tiles[i], st, skip)) n++;
    return n;
  }
  function isActive(st) {
    return !!(st.q || st.year || st.make || st.model || st.win.length || st.look || st.sf || st.sr);
  }
  function copyState(st) {
    var o = {};
    KEYS.forEach(function (k) { o[k] = k === "win" ? st.win.slice() : st[k]; });
    return o;
  }
  function countText(n) {
    if (!status) return String(n);
    var tpl = n === 0 ? status.getAttribute("data-zero") : n === 1 ? status.getAttribute("data-one") : status.getAttribute("data-many");
    return String(tpl).replace("{n}", n);
  }

  // ---------- selects: cascade and facet counts ----------
  var modelOpts = sels.model ? slice.call(sels.model.options).filter(function (o) { return o.value; }).map(function (o) {
    return { value: o.value, make: o.getAttribute("data-make") || "", text: o.textContent };
  }) : [];
  var baseText = {};
  Object.keys(sels).forEach(function (k) {
    slice.call(sels[k].options).forEach(function (o) { if (o.value) baseText[k + "|" + o.value] = o.textContent; });
  });
  var modelKey = "";
  function ensureOption(sel, key, val) {
    if (!sel || !val) return;
    var has = slice.call(sel.options).some(function (o) { return o.value === val; });
    if (!has) {
      var o = document.createElement("option");
      o.value = val; o.textContent = val;
      baseText[key + "|" + val] = val;
      sel.appendChild(o);
    }
  }
  function syncSelects() {
    if (sels.model) {
      var list = modelOpts.filter(function (m) { return !state.make || m.make === state.make; });
      var key = state.make + "#" + list.map(function (m) { return m.value; }).join("|");
      if (key !== modelKey) {
        modelKey = key;
        var first = sels.model.options[0];
        sels.model.textContent = "";
        sels.model.appendChild(first);
        list.forEach(function (m) {
          var o = document.createElement("option");
          o.value = m.value; o.textContent = m.text; o.setAttribute("data-make", m.make);
          sels.model.appendChild(o);
        });
      }
      ensureOption(sels.model, "model", state.model);
      sels.model.disabled = sels.model.options.length < 2;
    }
    Object.keys(sels).forEach(function (k) {
      var sel = sels[k];
      ensureOption(sel, k, state[k]);
      sel.value = state[k];
      slice.call(sel.options).forEach(function (o) {
        if (!o.value) return;
        var probe = copyState(state);
        probe[k] = o.value;
        if (k === "make") probe.model = "";
        var n = count(probe, null);
        // A count reads with the name ("Ford (4)"); zero leaves the option in place, disabled, so the
        // list never jumps around while someone is choosing.
        o.textContent = (baseText[k + "|" + o.value] || o.value) + " (" + n + ")";
        o.disabled = n === 0 && o.value !== state[k];
      });
    });
  }

  // ---------- chip groups (windows: many; look: one) ----------
  function syncGroups() {
    groups.forEach(function (g) {
      var key = g.getAttribute("data-gal-group");
      slice.call(g.querySelectorAll("button[data-val]")).forEach(function (b) {
        var val = b.getAttribute("data-val");
        var on = key === "win" ? state.win.indexOf(val) > -1 : state[key] === val;
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  }
  function groupLabel(key, val) {
    var b = root.querySelector('[data-gal-group="' + key + '"] button[data-val="' + val + '"]');
    return b ? b.textContent.trim() : val;
  }
  function selLabel(key, val) {
    return baseText[key + "|" + val] || val;
  }

  // ---------- active filter chips ----------
  function atoms(st) {
    var out = [];
    var L = function (k) { return activeList ? activeList.getAttribute("data-l-" + k) || k : k; };
    if (st.q) out.push({ k: "q", label: "“" + st.q.trim() + "”", name: L("q") });
    if (st.year) out.push({ k: "year", label: st.year, name: L("year") });
    if (st.make) out.push({ k: "make", label: selLabel("make", st.make), name: L("make") });
    if (st.model) out.push({ k: "model", label: selLabel("model", st.model), name: L("model") });
    st.win.forEach(function (w) { out.push({ k: "win", v: w, label: groupLabel("win", w), name: L("win") }); });
    if (st.look) out.push({ k: "look", label: groupLabel("look", st.look), name: L("look") });
    if (st.sf) out.push({ k: "sf", label: L("sf") + " " + selLabel("sf", st.sf), name: "" });
    if (st.sr) out.push({ k: "sr", label: L("sr") + " " + selLabel("sr", st.sr), name: "" });
    return out;
  }
  function dropAtom(st, at) {
    if (at.k === "win") st.win = st.win.filter(function (w) { return w !== at.v; });
    else if (at.k === "make") { st.make = ""; st.model = ""; }
    else st[at.k] = "";
  }
  var removeTpl = activeList ? activeList.getAttribute("data-remove") || "Remove {label}" : "Remove {label}";
  var X_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  function renderChips(list) {
    if (!activeList) return;
    activeList.textContent = "";
    list.forEach(function (at, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ws5-achip";
      b.setAttribute("data-i", String(i));
      b.setAttribute("aria-label", removeTpl.replace("{label}", (at.name ? at.name + ": " : "") + at.label));
      var s = document.createElement("span");
      s.textContent = at.label;
      b.appendChild(s);
      b.insertAdjacentHTML("beforeend", X_SVG);
      li.appendChild(b);
      activeList.appendChild(li);
    });
  }

  // ---------- URL ----------
  function toQuery(st) {
    var p = [];
    KEYS.forEach(function (k) {
      var v = k === "win" ? st.win.join(",") : String(st[k] || "").trim();
      if (v) p.push(k + "=" + encodeURIComponent(v).replace(/%20/g, "+"));
    });
    return p.length ? "?" + p.join("&") : "";
  }
  function readUrl() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v == null) return;
      v = v.slice(0, 80);
      if (k === "win") state.win = v.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      else if (k === "sf" || k === "sr" || k === "year") state[k] = /^\d{1,4}$/.test(v) ? v : "";
      else state[k] = v;
    });
  }
  var urlTimer = 0;
  function writeUrl(st) {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      try { history.replaceState(history.state, "", window.location.pathname + toQuery(st) + window.location.hash); } catch (e) { /* storage of the URL is a nicety */ }
    }, 250);
  }
  carry.forEach(function (a) { a.setAttribute("data-href", a.getAttribute("href")); });
  function syncCarry(qs) {
    carry.forEach(function (a) { a.setAttribute("href", a.getAttribute("data-href") + qs); });
  }

  // ---------- apply ----------
  var statusTimer = 0;
  function setStatus(text, later) {
    if (!status) return;
    clearTimeout(statusTimer);
    if (later) statusTimer = setTimeout(function () { status.textContent = text; }, 450);
    else status.textContent = text;
  }
  var nearAtom = null;
  function apply(opts) {
    opts = opts || {};
    var shown = 0;
    for (var i = 0; i < tiles.length; i++) {
      var ok = matches(tiles[i], state, null);
      if (tiles[i].el.hidden === ok) tiles[i].el.hidden = !ok;
      if (ok) shown++;
    }
    var active = isActive(state);
    strips.forEach(function (s) { s.hidden = active; });
    // One or two photos left show large, as on a short filter page (peak pass R2, visual S1); three
    // stay in the normal grid so no tile sits alone on a row.
    if (grid) grid.setAttribute("data-n", shown > 0 && shown < 3 ? String(shown) : (tiles.length < 4 ? String(tiles.length) : "many"));
    setStatus(countText(shown), opts.typing);
    if (empty) empty.hidden = shown !== 0;
    if (reset) reset.hidden = !active;
    if (clear) clear.hidden = !state.q;
    var list = atoms(state);
    renderChips(list);
    if (moreCount) {
      var m = state.win.length + (state.look ? 1 : 0) + (state.sf ? 1 : 0) + (state.sr ? 1 : 0);
      moreCount.textContent = m ? " (" + m + ")" : "";
    }
    // Closest match: the first single filter (least important first) whose removal brings photos back.
    nearAtom = null;
    if (near) {
      if (shown === 0 && list.length) {
        var order = ["sf", "sr", "look", "win", "year", "model", "make", "q"];
        for (var o = 0; o < order.length && !nearAtom; o++) {
          for (var a = 0; a < list.length; a++) {
            if (list[a].k !== order[o]) continue;
            var probe = copyState(state);
            dropAtom(probe, list[a]);
            var n = count(probe, null);
            if (n > 0) { nearAtom = list[a]; nearAtom.n = n; break; }
          }
        }
      }
      if (nearAtom && nearBtn) {
        nearBtn.textContent = near.getAttribute("data-tpl").replace("{n}", countText(nearAtom.n).toLowerCase()).replace("{filter}", (nearAtom.name ? nearAtom.name + ": " : "") + nearAtom.label);
      }
      near.hidden = !nearAtom;
    }
    syncSelects();
    syncGroups();
    var qs = toQuery(state);
    syncCarry(qs);
    if (!opts.noUrl) writeUrl(state);
  }

  // ---------- events ----------
  if (input) input.addEventListener("input", function () { state.q = input.value; apply({ typing: true }); });
  if (input) input.addEventListener("keydown", function (e) { if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = ""; state.q = ""; apply(); } });
  if (clear) clear.addEventListener("click", function () { input.value = ""; state.q = ""; apply(); input.focus(); });
  Object.keys(sels).forEach(function (k) {
    sels[k].addEventListener("change", function () {
      var val = sels[k].value;
      state[k] = val;
      if (k === "make") state.model = "";
      if (k === "model" && val) {
        var m = modelOpts.filter(function (x) { return x.value === val; })[0];
        if (m && m.make) state.make = m.make;
      }
      apply();
    });
  });
  groups.forEach(function (g) {
    var key = g.getAttribute("data-gal-group");
    g.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button[data-val]") : null;
      if (!btn) return;
      var val = btn.getAttribute("data-val");
      if (key === "win") {
        var at = state.win.indexOf(val);
        if (at > -1) state.win.splice(at, 1); else state.win.push(val);
      } else state[key] = state[key] === val ? "" : val;
      apply();
    });
  });
  if (activeList) activeList.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-i]") : null;
    if (!b) return;
    var i = parseInt(b.getAttribute("data-i"), 10);
    var list = atoms(state);
    if (!list[i]) return;
    dropAtom(state, list[i]);
    if (list[i].k === "q" && input) input.value = "";
    apply();
    // Focus stays in the chip row: the chip that took this one's place, else the one before, else
    // the search box.
    var left = activeList.querySelectorAll("button[data-i]");
    var next = left[Math.min(i, left.length - 1)];
    if (next) next.focus(); else if (input) input.focus();
  });
  function clearAll() {
    state = { q: "", year: "", make: "", model: "", win: [], look: "", sf: "", sr: "" };
    if (input) input.value = "";
    apply();
  }
  if (reset) reset.addEventListener("click", function () { clearAll(); if (input) input.focus(); });
  if (nearBtn) nearBtn.addEventListener("click", function () {
    if (!nearAtom) return;
    dropAtom(state, nearAtom);
    if (nearAtom.k === "q" && input) input.value = "";
    apply();
    var firstOpen = tiles.filter(function (t) { return !t.el.hidden; })[0];
    var link = firstOpen ? firstOpen.el.querySelector("[data-gal-open]") : null;
    if (link) link.focus();
  });

  // First paint: the URL's filters (a shared or bookmarked view). Without any, nothing moves.
  readUrl();
  if (input && state.q) input.value = state.q;
  if (isActive(state)) apply({ noUrl: true });
  else { syncSelects(); syncCarry(""); }
  // "More filters" stays as the page drew it (closed): opening it here would move the grid after
  // first paint. Its summary shows how many of its filters the URL set, and the chips name them.

  /* Photo viewer (peak pass R1, visual G1). A native modal <dialog>: the browser keeps focus inside it
     and closes it on Escape. Left and right arrows page through the photos the filters still show;
     focus goes back to the tile that opened it. The enlarged image is the tile's own <picture>, cloned
     with sizes for the dialog, so it uses the larger files already built (up to 1280 px). Alt text,
     the title and the spec block come from the tile. No motion under reduced motion (CSS). */
  var viewer = $("[data-gal-viewer]");
  if (!viewer || typeof viewer.showModal !== "function" || !tileEls.length) return;
  var vImg = viewer.querySelector("[data-gal-vimg]");
  var vTitle = viewer.querySelector("[data-gal-vtitle]");
  var vSpec = viewer.querySelector("[data-gal-vspec]");
  var vBuild = viewer.querySelector("[data-gal-vbuild]");
  var vCount = viewer.querySelector("[data-gal-vcount]");
  var countTpl = viewer.getAttribute("data-count") || "{n} of {total}";
  var current = -1;
  var opener = null;
  var SIZES = "(min-width: 1312px) 1280px, calc(100vw - 32px)";
  function visible() { return tileEls.filter(function (t) { return !t.hidden; }); }
  function show(tile) {
    var list = visible();
    current = list.indexOf(tile);
    var pic = tile.querySelector("picture");
    vImg.textContent = "";
    if (pic) {
      var copy = pic.cloneNode(true);
      slice.call(copy.querySelectorAll("source")).forEach(function (s) { s.setAttribute("sizes", SIZES); });
      var ci = copy.querySelector("img");
      if (ci) { ci.setAttribute("sizes", SIZES); ci.removeAttribute("loading"); ci.removeAttribute("style"); ci.setAttribute("decoding", "async"); }
      vImg.appendChild(copy);
    }
    var t = tile.querySelector(".ws5-gt__t");
    vTitle.textContent = t ? t.textContent : "";
    vSpec.textContent = "";
    var spec = [];
    try { spec = JSON.parse(tile.getAttribute("data-spec") || "[]"); } catch (e) { spec = []; }
    spec.forEach(function (row) {
      var d = document.createElement("div");
      var dt = document.createElement("dt");
      var dd = document.createElement("dd");
      dt.textContent = row[0];
      dd.textContent = row[1];
      d.appendChild(dt); d.appendChild(dd);
      vSpec.appendChild(d);
    });
    var b = tile.querySelector(".ws5-gt__a");
    if (b && vBuild) { vBuild.setAttribute("href", b.getAttribute("href")); vBuild.hidden = false; }
    else if (vBuild) vBuild.hidden = true;
    vCount.textContent = countTpl.replace("{n}", String(current + 1)).replace("{total}", String(list.length));
  }
  function step(d) {
    var list = visible();
    if (!list.length) return;
    show(list[(current + d + list.length) % list.length]);
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
      var f = slice.call(viewer.querySelectorAll("a[href]:not([hidden]), button")).filter(function (x) { return !x.hidden; });
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
})();
