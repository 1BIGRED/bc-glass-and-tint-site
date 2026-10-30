/* BC Glass & Tint v3, Build Your Tint (WS4; blueprint 4.5, art direction 3.6, engineering 3.2.3,
   3.2.5, 3.4). Reads ONE gated config the build prints (script[data-bt-config]); production pages
   carry no draft number, so nothing here can show one. Prices: window.BCPrice (00-price-core.js,
   the same file lib/pricing.js uses). Codes: window.BCBuild (10-buildcode.js).

   Markup contract (build-your-tint.njk):
     [data-bt]                 the section; [data-bt-config] JSON inside it
     input[name=bt-v]          vehicle radios          input[name=bt-preset]  preset radios
     input[name=bt-w-<win>]    shade radios per window (value 0 = no film; front never below 35)
     input[name=bt-ask]        "Also ask about" toggles (never change the total)
     [data-bt-total] [data-bt-draft] [data-bt-code] [data-bt-summary] [data-bt-parts] [data-bt-fvp]
     [data-bt-addons] [data-bt-addon-list] [data-bt-ask-dyn] [data-bt-legal]
     [data-bt-primary] (the WS2 action macro) [data-bt-resume] [data-bt-live]

   Hand-off: <html data-bc-build="BC-..."> and a "bc:build" event { code, service, summary, url } on document, on every change.
   The action system (WS2, 30-actions.js) links its Request a time to /book?s=car&b=<code> (WS3)
   and its Text this build to a pre-filled sms: from that event.
   Events: CustomEvent("bc:ev", { detail: { event, params } }) on document, forwarded by events.js
   (WS3): build_start, preset_pick, panel_change, addon_toggle, build_complete. No personal data.
   Storage: localStorage "bc_build_v1" holds the code only; sessionStorage "bc_build_model_v1" holds
   the optional year, make and model for /book. Every access is in try/catch. */
(function () {
  "use strict";
  var root = document.querySelector("[data-bt]");
  if (!root || !window.BCPrice || !window.BCBuild) return;
  var cfgEl = root.querySelector("[data-bt-config]");
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }

  var BP = window.BCPrice, BB = window.BCBuild;
  var WINS = ["front", "rear", "back"];
  var STORE = "bc_build_v1", MODEL = "bc_build_model_v1";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = { v: null, front: 0, rear: 0, back: 0, addons: [], preset: null, current: null };
  var started = false, completed = false;

  function $(sel) { return root.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function tpl(s, map) { return String(s || "").replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : ""; }); }
  function lowerFirst(s) { s = String(s || ""); return s.charAt(0).toLowerCase() + s.slice(1); }
  function store(kind, key, val) {
    try {
      var s = kind === "local" ? window.localStorage : window.sessionStorage;
      if (val === undefined) return s.getItem(key);
      if (val === null) s.removeItem(key); else s.setItem(key, val);
    } catch (e) { /* storage blocked: the page still works */ }
    return null;
  }
  function emit(name, params) {
    try { document.dispatchEvent(new CustomEvent("bc:ev", { detail: { event: name, params: params || {} } })); } catch (e) { /* old browser */ }
  }
  function begin() {
    if (started) return;
    started = true;
    emit("build_start", {});
  }
  var byId = function (list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; };
  function shadeOf(w, v) { var l = cfg.shades[w] || []; for (var i = 0; i < l.length; i++) if (l[i].v === v) return l[i]; return null; }
  function windowOf(w) { return byId(cfg.windows, w); }
  function cls() { return state.v ? byId(cfg.classes, state.v) : null; }
  function addonsFor(v) { return (v && cfg.addons[v]) || []; }
  function words() {
    var o = {};
    Object.keys(cfg.words || {}).forEach(function (k) { o[k] = lowerFirst(cfg.words[k]); });
    return o;
  }

  // ---------- reading the form into state ----------
  function readWindows() {
    WINS.forEach(function (w) {
      var c = root.querySelector('input[name="bt-w-' + w + '"]:checked');
      if (c) state[w] = Number(c.value) || 0;
    });
  }

  // ---------- writing state into the form ----------
  function setRadio(name, value) {
    $$('input[name="' + name + '"]').forEach(function (i) { i.checked = value != null && String(i.value) === String(value); });
  }
  function syncForm() {
    setRadio("bt-v", state.v);
    setRadio("bt-preset", state.preset);
    WINS.forEach(function (w) {
      var s = state[w];
      // "x" (window picked, shade not chosen yet) leaves every radio of that window unchecked.
      setRadio("bt-w-" + w, s === "x" ? null : s);
    });
    $$('input[name="bt-ask"]').forEach(function (i) { i.checked = state.addons.indexOf(i.value) > -1; });
  }

  // ---------- the stage ----------
  function paintStage() {
    var svg = $("[data-bt-svg]");
    if (!svg) return;
    var shown = state.v || "car";
    Array.prototype.forEach.call(svg.querySelectorAll("[data-body]"), function (g) {
      if (g.getAttribute("data-body") === shown) g.removeAttribute("hidden"); else g.setAttribute("hidden", "");
    });
    svg.classList.toggle("is-empty", !state.v);
    WINS.forEach(function (w) {
      var s = state[w], sh = typeof s === "number" && s > 0 ? shadeOf(w, s) : null;
      Array.prototype.forEach.call(svg.querySelectorAll('[data-win="' + w + '"]'), function (g) {
        var t = g.querySelector("[data-tint]");
        if (t) t.style.fillOpacity = sh ? String(sh.a) : "0";
        g.classList.toggle("is-unset", s === "x");
        g.classList.toggle("is-current", state.current === w);
      });
    });
  }

  // ---------- price ----------
  function windowKeys() {
    return WINS.filter(function (w) { return state[w] !== 0; }).map(function (w) { return windowOf(w).key; });
  }
  function pricedAddonKeys() {
    return addonsFor(state.v).filter(function (a) { return a.state === "priced" && state.addons.indexOf(a.id) > -1; }).map(function (a) { return a.key; });
  }
  function quote() {
    // No vehicle and nothing picked: the page's opening line ("Pick a starting point" while presets
    // exist). Windows picked but no vehicle: ask for the vehicle, which sets the price class.
    if (!state.v) return { kind: "empty", text: windowKeys().length ? cfg.text.empty_vehicle : cfg.text.empty };
    var keys = windowKeys().concat(pricedAddonKeys());
    if (!keys.length) return { kind: "empty", text: cfg.text.empty };
    var q = BP.quoteFor(cfg.pricing, state.v, keys, cfg.mode);
    if (!q.show) return { kind: "fallback", text: cfg.text.fallback };
    return { kind: "price", text: q.display, draft: q.draft, parts: q.parts };
  }

  function code() {
    if (!state.v) return null;
    return BB.encode({ v: state.v, front: state.front, rear: state.rear, back: state.back, addons: state.addons });
  }

  // ---------- painting the result ----------
  function setText(sel, text) { $$(sel).forEach(function (el) { el.textContent = text; }); }
  function show(sel, on) { $$(sel).forEach(function (el) { if (on) el.removeAttribute("hidden"); else el.setAttribute("hidden", ""); }); }

  function paintSteps() {
    var items = $$("[data-bt-steps] li");
    var n = !state.v ? 1 : (items.length === 3 && !state.preset && !windowKeys().length ? 2 : items.length);
    items.forEach(function (li, i) {
      if (i + 1 === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }

  function paintWindows() {
    WINS.forEach(function (w) {
      var row = root.querySelector('[data-bt-window="' + w + '"]');
      if (!row) return;
      var s = state[w], sh = typeof s === "number" && s > 0 ? shadeOf(w, s) : null;
      var val = row.querySelector("[data-bt-wval]");
      if (val) val.textContent = s === "x" ? cfg.text.unset : sh ? sh.name : cfg.text.no_film;
      row.classList.toggle("is-current", state.current === w);
      row.classList.toggle("is-unset", s === "x");
    });
  }

  function paintAddons() {
    var list = addonsFor(state.v);
    var priced = list.filter(function (a) { return a.state === "priced"; });
    var ask = list.filter(function (a) { return a.state === "ask"; });
    var box = $("[data-bt-addon-list]");
    var dyn = $("[data-bt-ask-dyn]");
    var key = (state.v || "") + "|" + list.map(function (a) { return a.id + a.state; }).join(",");
    if (box && box.getAttribute("data-key") !== key) {
      box.setAttribute("data-key", key);
      box.innerHTML = "";
      dyn.innerHTML = "";
      priced.forEach(function (a) { box.appendChild(checkRow(a, true)); });
      ask.forEach(function (a) { dyn.appendChild(checkRow(a, false)); });
    }
    show("[data-bt-addons]", priced.length > 0);
    $$('input[name="bt-addon"]').forEach(function (i) { i.checked = state.addons.indexOf(i.value) > -1; });
  }
  function checkRow(a, priced) {
    var label = document.createElement("label");
    label.className = "bt-check";
    var input = document.createElement("input");
    input.type = "checkbox";
    input.name = "bt-addon";
    input.value = a.id;
    var box = document.createElement("span");
    box.className = "bt-check__box";
    box.setAttribute("aria-hidden", "true");
    var t = document.createElement("span");
    t.className = "bt-check__t";
    var name = document.createElement("span");
    name.textContent = a.label;
    t.appendChild(name);
    var extra = document.createElement("span");
    extra.className = "fg-2";
    var bits = priced ? a.display : "(" + cfg.text.ask_price + ")";
    extra.textContent = " " + bits + (a.benefit ? ": " + a.benefit : "");
    t.appendChild(extra);
    if (priced && a.draft) {
      var tag = document.createElement("span");
      tag.className = "bt-draft t-label";
      tag.textContent = cfg.text.draft_tag;
      t.appendChild(document.createTextNode(" "));
      t.appendChild(tag);
    }
    label.appendChild(input);
    label.appendChild(box);
    label.appendChild(t);
    return label;
  }

  function paintParts(q) {
    var dl = $("[data-bt-parts]");
    var on = q.kind === "price" && q.parts && q.parts.length > 1;
    show("[data-bt-parts-wrap]", on);
    if (!dl) return;
    dl.innerHTML = "";
    if (!on) return;
    q.parts.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "bt-parts__row";
      var dt = document.createElement("dt");
      dt.textContent = p.label;
      var dd = document.createElement("dd");
      dd.className = "tnum";
      dd.textContent = p.display;
      row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    });
  }

  function paintFvp() {
    var el = $("[data-bt-fvp]");
    var c = cls();
    var f = state.v && cfg.fvp[state.v];
    var frontsOnly = state.front !== 0 && state.rear === 0 && state.back === 0;
    if (!el || !c || !f || !frontsOnly) { show("[data-bt-fvp]", false); return; }
    el.textContent = tpl(cfg.text.fronts_vs_full, { vehicle: c.noun || c.label, article: c.article || c.label, rear: lowerFirst(f.rear.display), full: lowerFirst(f.full.display) });
    if (f.draft) {
      var tag = document.createElement("span");
      tag.className = "bt-draft t-label";
      tag.textContent = cfg.text.draft_tag;
      el.appendChild(document.createTextNode(" "));
      el.appendChild(tag);
    }
    show("[data-bt-fvp]", true);
  }

  function paintLegal() {
    var ul = $("[data-bt-legal]");
    if (!ul) return;
    ul.innerHTML = "";
    var seen = {};
    WINS.forEach(function (w) {
      if (state[w] === 0) return;
      var win = windowOf(w);
      if (seen[win.legal]) return;
      seen[win.legal] = true;
      var li = document.createElement("li");
      li.textContent = win.label + ": " + win.legal;
      ul.appendChild(li);
    });
    if (state.addons.indexOf("top-strip") > -1 && cfg.text.strip_legal) {
      var st = document.createElement("li");
      st.textContent = cfg.text.strip_legal;
      ul.appendChild(st);
    }
  }

  var liveTimer = null;
  function announce(text) {
    var el = $("[data-bt-live]");
    if (!el) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { el.textContent = text; }, 350);
  }

  function handOff(c, summary) {
    var url = location.origin + location.pathname + (c ? "?b=" + encodeURIComponent(c) : "");
    if (c) document.documentElement.setAttribute("data-bc-build", c);
    else document.documentElement.removeAttribute("data-bc-build");
    // The action system (WS2, 30-actions.js) listens for bc:build and links every [data-build]
    // control with the code: Request a time to /book?s=car&b=<code>, Text this build to sms:.
    try { document.dispatchEvent(new CustomEvent("bc:build", { detail: { code: c, service: "car", summary: summary, url: url } })); } catch (e) { /* old browser */ }
  }

  function paint(opts) {
    var q = quote();
    var c = code();
    root.setAttribute("data-kind", q.kind);
    // P-b: "From" is set small before the number, the dollar figure in the price face.
    var from = q.kind === "price" ? /^(From|Typically)\s+(.*)$/.exec(q.text) : null;
    $$("[data-bt-total]").forEach(function (el) {
      el.textContent = "";
      if (from) {
        var w = document.createElement("span");
        w.className = "bt-from t-label";
        w.textContent = from[1] + " ";
        el.appendChild(w);
        el.appendChild(document.createTextNode(from[2]));
      } else {
        el.textContent = q.text;
      }
    });
    show("[data-bt-draft]", q.kind === "price" && !!q.draft);
    show("[data-bt-pricenote]", q.kind === "price");
    show("[data-bt-fallbacknote]", q.kind === "fallback");
    setText("[data-bt-code]", c || cfg.text.code_empty);
    var summary = c ? BB.summary(c, { confirmed: cfg.confirmed, words: words() }) : "";
    var sumEl = $("[data-bt-summary]");
    if (sumEl) { sumEl.textContent = summary; show("[data-bt-summary]", !!summary); }
    paintStage();
    paintSteps();
    paintWindows();
    paintAddons();
    paintParts(q);
    paintFvp();
    paintLegal();
    handOff(c, summary);
    // opts.keep: a vehicle preselected from ?class= is not a build yet, so it never overwrites a
    // saved build the visitor might still resume.
    if (c && !(opts && opts.keep)) store("local", STORE, c);
    if (state.v && windowKeys().length && !completed) {
      completed = true;
      emit("build_complete", { vehicle: state.v, preset_id: state.preset || "", code: c });
    }
    if (!(opts && opts.quiet)) announce(tpl(cfg.text.live_total, { total: q.text }) + (c ? " " + c + "." : ""));
  }

  // ---------- applying a build or a preset ----------
  function presetMatches(p) {
    return WINS.every(function (w) { return (p.set[w] === undefined ? 0 : p.set[w]) === state[w]; });
  }
  function applyPreset(id) {
    var p = byId(cfg.presets, id);
    if (!p) return false;
    WINS.forEach(function (w) { state[w] = p.set[w] === undefined ? 0 : p.set[w]; });
    state.preset = id;
    state.current = null;
    return true;
  }
  function applyCode(c) {
    var b = BB.decode(c);
    if (!b) return false;
    // A shade the builder does not offer for that window (for example an old link) becomes
    // "pick a shade"; the front doors can never be set below the legal line (decode refuses it).
    state.v = b.v;
    WINS.forEach(function (w) {
      var s = b[w];
      state[w] = typeof s === "number" && s > 0 && !shadeOf(w, s) ? "x" : s;
    });
    var allowed = addonsFor(b.v).map(function (a) { return a.id; }).concat(cfg.also_ask.map(function (a) { return a.id; }));
    state.addons = b.addons.filter(function (id) { return allowed.indexOf(id) > -1; });
    state.preset = null;
    cfg.presets.forEach(function (p) { if (!state.preset && presetMatches(p)) state.preset = p.id; });
    return true;
  }
  function dropUnavailableAddons() {
    var allowed = addonsFor(state.v).map(function (a) { return a.id; }).concat(cfg.also_ask.map(function (a) { return a.id; }));
    state.addons = state.addons.filter(function (id) { return allowed.indexOf(id) > -1; });
  }
  function canonicalAddons(list) {
    return BB.ADDONS.map(function (a) { return a.id; }).filter(function (id) { return list.indexOf(id) > -1; });
  }

  // ---------- events ----------
  root.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || !t.name) return;
    begin();
    if (t.name === "bt-v") {
      state.v = t.value;
      dropUnavailableAddons();
    } else if (t.name === "bt-preset") {
      applyPreset(t.value);
      emit("preset_pick", { preset_id: t.value, vehicle: state.v || "" });
    } else if (t.name.indexOf("bt-w-") === 0) {
      var w = t.name.slice(5);
      state[w] = Number(t.value) || 0;
      state.current = w;
      if (state.preset) {
        var p = byId(cfg.presets, state.preset);
        if (!p || !presetMatches(p)) state.preset = null;
      }
      emit("panel_change", { panel: w, shade: state[w] ? String(state[w]) : "none", vehicle: state.v || "" });
    } else if (t.name === "bt-addon" || t.name === "bt-ask") {
      var list = state.addons.filter(function (id) { return id !== t.value; });
      if (t.checked) list.push(t.value);
      state.addons = canonicalAddons(list);
      emit("addon_toggle", { addon: t.value, on: t.checked ? "1" : "0", vehicle: state.v || "" });
    } else {
      return;
    }
    syncForm();
    paint();
  });

  var model = $("[data-bt-model]");
  if (model) {
    var saved = store("session", MODEL);
    if (saved) model.value = saved;
    model.addEventListener("input", function () {
      var v = model.value.replace(/[\u0000-\u001f<>]/g, "").slice(0, 60);
      store("session", MODEL, v ? v : null);
    });
  }

  // Tap a window on the stage: select it and move to its row (pointer convenience; the rows are the
  // real, keyboard-reachable controls, so the drawing stays aria-hidden).
  var svgEl = $("[data-bt-svg]");
  if (svgEl) svgEl.addEventListener("click", function (e) {
    var g = e.target && e.target.closest ? e.target.closest("[data-win]") : null;
    if (!g) return;
    begin();
    var w = g.getAttribute("data-win");
    state.current = w;
    var row = root.querySelector('[data-bt-window="' + w + '"]');
    if (row) {
      var inp = row.querySelector("input:checked") || row.querySelector("input");
      try { row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); } catch (err) { row.scrollIntoView(); }
      if (inp) { try { inp.focus({ preventScroll: true }); } catch (err2) { inp.focus(); } }
    }
    paint({ quiet: true });
  });

  $$("[data-bt-example]").forEach(function (b) {
    b.addEventListener("click", function () {
      begin();
      state.v = b.getAttribute("data-vehicle");
      dropUnavailableAddons();
      applyPreset(b.getAttribute("data-preset"));
      emit("preset_pick", { preset_id: state.preset || "", vehicle: state.v, source: "example" });
      syncForm();
      paint();
      var res = $("[data-bt-tune]");
      if (res) { try { res.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); } catch (err) { res.scrollIntoView(); } }
    });
  });

  // ---------- start ----------
  var fromUrl = null, fromClass = null;
  try {
    var qs = new URLSearchParams(location.search);
    fromUrl = qs.get("b");
    fromClass = qs.get("class");
  } catch (e) { fromUrl = null; fromClass = null; }
  // ?class=<id> (the Car / SUV / Pickup / Van switch on the homepage car lane and /auto-tint,
  // integration pass): preselect that vehicle ONLY. No preset, no window, no add-on is chosen, and
  // the vehicle alone is not stored as a build (the visitor has not built anything yet).
  var classOnly = !!(fromClass && byId(cfg.classes, String(fromClass).toLowerCase()));
  var resumeBox = $("[data-bt-resume]");
  if (fromUrl && applyCode(fromUrl)) {
    // Arriving with a code (a price row, a gallery card, a shared link) is the visitor's scope
    // (blueprint 4.5 default rule); it is not a build they made here, so no build_complete.
    started = true;
    completed = true;
    classOnly = false;
  } else if (classOnly) {
    state.v = String(fromClass).toLowerCase();
    state.preset = null;
    state.addons = [];
    var prevC = store("local", STORE);
    if (prevC && BB.isValid(prevC) && resumeBox) {
      resumeBox.removeAttribute("hidden");
      var goC = resumeBox.querySelector("[data-bt-resume-go]");
      var clearC = resumeBox.querySelector("[data-bt-resume-clear]");
      if (goC) goC.addEventListener("click", function () {
        begin();
        applyCode(prevC);
        resumeBox.setAttribute("hidden", "");
        syncForm();
        paint();
      });
      if (clearC) clearC.addEventListener("click", function () {
        store("local", STORE, null);
        resumeBox.setAttribute("hidden", "");
      });
    }
  } else {
    if (cfg.default_preset) applyPreset(cfg.default_preset);
    var prev = store("local", STORE);
    if (prev && BB.isValid(prev) && resumeBox) {
      resumeBox.removeAttribute("hidden");
      var go = resumeBox.querySelector("[data-bt-resume-go]");
      var clear = resumeBox.querySelector("[data-bt-resume-clear]");
      if (go) go.addEventListener("click", function () {
        begin();
        applyCode(prev);
        resumeBox.setAttribute("hidden", "");
        syncForm();
        paint();
      });
      if (clear) clear.addEventListener("click", function () {
        store("local", STORE, null);
        resumeBox.setAttribute("hidden", "");
      });
    }
  }
  if (!reduce) root.classList.add("bt-anim");
  syncForm();
  readWindows();
  paint({ quiet: true, keep: classOnly });
})();
