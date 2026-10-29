/* BC Glass & Tint, Build Your Tint ("The Showroom"). Vanilla JS, no libraries, no network calls.
   Progressive enhancement over the server-rendered form in [data-bt] (build-your-tint.njk).
   Wording and legal text come from script[data-bt-config] (build_your_tint.json "builder"),
   prices from script[data-bt-pricing] (a gated copy of _data/pricing.json made in
   build-your-tint.11tydata.js). Same rule as lib/pricing.js: production shows a price only when
   status is "confirmed" AND publish is true; with data-price-mode="preview" on [data-bt] it also
   shows draft and unpublished prices, tagged. legal_hold entries never show. Otherwise the
   fallback text.

   Markup contract (hooks; every one is optional, a missing hook is skipped):
     radios      name="bt-v" (vehicle), "bt-p" (current window), "bt-s-<panel>" (shade per window),
                 "bt-t" (time of day: noon, dusk, night; relights the stage only)
     [data-bt-svg]            the illustration; [data-body="<vehicle>"] groups, [data-glass="<panel>"]
                              groups (get .is-current / .is-blocked), [data-tint="<panel>"] film layers
     [data-bt-stage]          gets data-scene="<time of day>" (CSS relights it: opacity only)
     [data-bt-shade="<p>"]    the shade fieldset for one window (only the current one is shown)
     [data-bt-pval="<p>"] [data-bt-plegal="<p>"]   per-window shade and short legal chip
     [data-bt-note]           long legal text for the current window
     Light Meter: [data-bt-mpanel] window name, [data-bt-mnum] numeral, [data-bt-mpct] the % sign,
                  [data-bt-mlabel] "light in", [data-bt-mbar] bar (transform scaleX), [data-bt-mlegal]
     Result (any number of copies, e.g. the top bar and the result card): [data-bt-price],
       [data-bt-draft], [data-bt-pricenote], [data-bt-code], [data-bt-summary], [data-bt-step]
     [data-bt-actions] with a[data-bt-call] (tel:) and a[data-bt-text] (sms:, body is filled in)
     [data-bt-closed] hint shown while the shop is closed; [data-bt-live] polite live region
   Open or closed: [data-bt] data-open="0|1" wins; else html[data-bc-open]; else the sticky call
   bar's data-state="closed" set by assets/v2/status.js.
   Share: ?b=C-35-15-15-0 (vehicle code, then one shade per window in panel_order) restores a build;
   the URL is updated in place (replaceState) once the visitor changes something.
   GA4 (only through the site's gtag): config_start, config_panel_change, config_complete. */
(function () {
  'use strict';
  var root = document.querySelector('[data-bt]');
  if (!root || !document.querySelector || !window.JSON) return;

  function readJson(sel) {
    var el = root.querySelector(sel) || document.querySelector(sel);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }
  var cfg = readJson('script[data-bt-config]');
  var pricing = readJson('script[data-bt-pricing]') || {};
  if (!cfg || !cfg.panels || !cfg.vehicles || !cfg.legal || !cfg.text) return;
  var T = cfg.text, L = cfg.legal;
  var ORDER = cfg.panel_order || ['front', 'rear', 'back', 'strip'];
  var FRONT_MIN = cfg.front_min_vlt || 35;

  function $(sel) { return root.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function fill(str, map) {
    return String(str || '').replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : ''; });
  }
  function checkedVal(name) {
    var el = root.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  function setChecked(name, val) {
    $$('input[name="' + name + '"]').forEach(function (r) { r.checked = (r.value === String(val)); });
  }
  function hasValue(name, val) {
    return !!root.querySelector('input[name="' + name + '"][value="' + val + '"]');
  }
  function showAll(sel, on) {
    $$(sel).forEach(function (el) { if (on) el.removeAttribute('hidden'); else el.setAttribute('hidden', ''); });
  }

  /* ---------- state (DOM is the source of truth on load, then the URL) ---------- */
  var state = { vehicle: checkedVal('bt-v') || 'car', current: checkedVal('bt-p') || ORDER[0], shade: {} };
  ORDER.forEach(function (p) { state.shade[p] = parseInt(checkedVal('bt-s-' + p) || '0', 10) || 0; });

  // ?b=S-35-15-15-0 restores a shared build. Invalid parts are ignored.
  (function fromUrl() {
    var m = /[?&]b=([^&#]+)/.exec(location.search);
    if (!m) return;
    var parts = decodeURIComponent(m[1]).toUpperCase().replace(/^BC-/, '').split('-');
    var vId = null;
    Object.keys(cfg.vehicles).forEach(function (k) { if (cfg.vehicles[k].code === parts[0]) vId = k; });
    if (vId && hasValue('bt-v', vId)) state.vehicle = vId;
    ORDER.forEach(function (p, i) {
      var n = parseInt(parts[i + 1], 10);
      if (!isNaN(n) && hasValue('bt-s-' + p, n)) state.shade[p] = n;
    });
  })();

  /* ---------- rules ---------- */
  function legalFor(p, v) {
    if (!v) return L.none;
    if (p === 'front') return v >= FRONT_MIN ? L.front_ok : L.front_blocked;
    if (p === 'strip') return L.strip;
    return L.rear;
  }
  function blocked(p, v) { return p === 'front' && v > 0 && v < FRONT_MIN; }
  // Gamma-aware overlay: opacity = 1 - VLT^(1/2.2). 35% draws at about 0.38.
  function opacityFor(v) { return v ? 1 - Math.pow(v / 100, 1 / 2.2) : 0; }
  function shadeText(v) { return v ? v + '%' : T.none; }

  // Returns null (hidden) or { draft: bool }. Mirrors priceFor() in lib/pricing.js.
  function gate(e) {
    if (!e || e.legal_hold === true || typeof e.amount !== 'number' || !(e.amount > 0)) return null;
    if (e.status === 'confirmed' && e.publish === true) return { draft: false };
    if (root.getAttribute('data-price-mode') === 'preview' && (e.status === 'draft' || e.status === 'confirmed')) return { draft: true };
    return null;
  }
  function disp(e) { return e.display || fill(T.price_from, { n: e.amount }); }
  // Cover the picked windows exactly with packages and separate lines that may show, fewest
  // pieces first. Any window left over means no price, never a partial total.
  function priceInfo() {
    var cls = cfg.vehicles[state.vehicle].price_class;
    var picked = ORDER.filter(function (p) { return state.shade[p] > 0; });
    if (!picked.length) return { text: T.price_empty, draft: false };
    if (picked.some(function (p) { return blocked(p, state.shade[p]); })) return { text: T.price_blocked, draft: false };
    var keys = picked.map(function (p) { return cfg.panels[p].price_key; });
    var at = pricing.auto_tint || {}, usable = [];
    function add(ks, e) { var g = gate(e); if (g && ks && ks.length) usable.push({ keys: ks, e: e, draft: g.draft }); }
    Object.keys(at.coverage || {}).forEach(function (k) { add(at.coverage[k].panels, at.coverage[k][cls]); });
    Object.keys(at.panels || {}).forEach(function (k) { add([k], at.panels[k][cls]); });
    function solve(rem) {
      if (!rem.length) return [];
      var best = null;
      usable.forEach(function (pc) {
        if (pc.keys.indexOf(rem[0]) < 0) return;
        if (!pc.keys.every(function (k) { return rem.indexOf(k) > -1; })) return;
        var rest = solve(rem.filter(function (k) { return pc.keys.indexOf(k) < 0; }));
        if (rest && (!best || rest.length + 1 < best.length)) best = [pc].concat(rest);
      });
      return best;
    }
    var parts = solve(keys);
    if (!parts) return { text: T.price_fallback, draft: false };
    var draft = parts.some(function (p) { return p.draft; });
    if (parts.length === 1) return { text: disp(parts[0].e), draft: draft, shown: true };
    var sum = parts.reduce(function (n, p) { return n + p.e.amount; }, 0);
    return { text: fill(T.price_from, { n: sum }), draft: draft, shown: true };
  }
  function code() {
    return 'BC-' + cfg.vehicles[state.vehicle].code + '-' + ORDER.map(function (p) { return state.shade[p] || 0; }).join('-');
  }
  function summary() {
    var out = [fill(T.summary_intro, { vehicle: cfg.vehicles[state.vehicle].label })];
    ORDER.forEach(function (p) {
      var v = state.shade[p], map = { panel: cfg.panels[p].label, shade: shadeText(v) };
      out.push(fill(!v ? T.summary_no_film : blocked(p, v) ? T.summary_blocked : T.summary_panel, map));
    });
    return out.join(' ');
  }

  /* ---------- rendering ---------- */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var svg = $('[data-bt-svg]');
  function paintSvg() {
    if (!svg) return;
    $$('[data-body]').forEach(function (g) {
      if (g.getAttribute('data-body') === state.vehicle) g.removeAttribute('display');
      else g.setAttribute('display', 'none');
    });
    var dur = reduce && reduce.matches ? '0ms' : '200ms';
    ORDER.forEach(function (p) {
      var v = state.shade[p];
      // Never depict a front door darker than the legal line: draw it at the 35% level.
      var drawV = blocked(p, v) ? FRONT_MIN : v;
      $$('[data-tint="' + p + '"]').forEach(function (el) {
        el.style.transition = 'opacity ' + dur + ' cubic-bezier(0.23, 1, 0.32, 1)';
        el.style.opacity = opacityFor(drawV).toFixed(3);
      });
      $$('[data-glass="' + p + '"]').forEach(function (el) {
        el.classList.toggle('is-current', p === state.current);
        el.classList.toggle('is-blocked', blocked(p, v));
      });
    });
  }

  // Sets the text of EVERY element matching sel (the bar and the result card both carry one).
  function setText(sel, txt) {
    $$(sel).forEach(function (el) { if (el.textContent !== txt) el.textContent = txt; });
  }

  function paintPanels() {
    ORDER.forEach(function (p) {
      var v = state.shade[p], l = legalFor(p, v);
      setText('[data-bt-pval="' + p + '"]', shadeText(v));
      $$('[data-bt-plegal="' + p + '"]').forEach(function (lg) {
        if (lg.textContent !== l.short) lg.textContent = l.short;
        lg.setAttribute('data-tone', l.tone || '');
      });
      showAll('[data-bt-shade="' + p + '"]', p === state.current);
    });
    var cur = legalFor(state.current, state.shade[state.current]);
    $$('[data-bt-note]').forEach(function (note) {
      if (note.textContent !== cur.long) note.textContent = cur.long;
      note.setAttribute('data-tone', cur.tone || '');
    });
    paintMeter(cur);
  }

  // The Light Meter: the current window's shade as a big numeral, a 2px bar and the legal chip.
  function paintMeter(cur) {
    var v = state.shade[state.current];
    setText('[data-bt-mpanel]', cfg.panels[state.current].label);
    setText('[data-bt-mnum]', v ? String(v) : T.none);
    showAll('[data-bt-mpct]', !!v);
    setText('[data-bt-mlabel]', v ? (T.meter_label || '') : (T.meter_none || ''));
    $$('[data-bt-mbar]').forEach(function (b) { b.style.transform = 'scaleX(' + (v / 100) + ')'; });
    $$('[data-bt-mlegal]').forEach(function (el) {
      if (el.textContent !== cur.short) el.textContent = cur.short;
      el.setAttribute('data-tone', cur.tone || '');
    });
    var m = $('[data-bt-meter]');
    if (m) {
      m.setAttribute('data-none', v ? '0' : '1');
      m.setAttribute('data-blocked', blocked(state.current, v) ? '1' : '0');
    }
  }

  var smsBase = null, callEl = $('a[data-bt-call]'), textEl = $('a[data-bt-text]');
  if (textEl) smsBase = (textEl.getAttribute('href') || '').split('?')[0];

  function shareUrl() {
    var b = code().replace(/^BC-/, '');
    var q = location.search.replace(/^\?/, '').split('&').filter(function (kv) { return kv && kv.indexOf('b=') !== 0; });
    q.push('b=' + b);
    return location.pathname + '?' + q.join('&') + location.hash;
  }

  function paintResult() {
    var c = code(), info = priceInfo(), price = info.text;
    setText('[data-bt-code]', c);
    setText('[data-bt-price]', price);
    showAll('[data-bt-draft]', !!info.draft);
    showAll('[data-bt-pricenote]', !!info.shown);
    setText('[data-bt-summary]', summary());
    var picked = ORDER.filter(function (p) { return state.shade[p] > 0; }).length;
    setText('[data-bt-step]', fill(T.step_of || 'Step {n} of 3', { n: picked ? 3 : 2 }));
    $$('[data-bt-blocked]').forEach(function (bl) {
      bl.textContent = T.front_blocked_note || '';
      if (blocked('front', state.shade.front)) bl.removeAttribute('hidden'); else bl.setAttribute('hidden', '');
    });
    var url = shareUrl();
    if (smsBase && textEl) {
      var abs = location.protocol === 'file:' ? url : location.origin + url;
      var body = fill(T.sms_body, { code: c, summary: summary(), url: abs });
      textEl.setAttribute('href', smsBase + '?&body=' + encodeURIComponent(body));
    }
    try { if (touched && history.replaceState) history.replaceState(null, '', url); } catch (e) { /* file:// in some browsers */ }
    return info.draft ? price + ' (' + (T.draft_tag || 'Draft price') + ')' : price;
  }

  function render() {
    syncInputs();
    paintSvg();
    paintPanels();
    return paintResult();
  }
  function syncInputs() {
    setChecked('bt-v', state.vehicle);
    setChecked('bt-p', state.current);
    ORDER.forEach(function (p) { setChecked('bt-s-' + p, state.shade[p]); });
  }

  /* ---------- time of day: relights the stage (CSS custom properties, opacity only) ---------- */
  var stage = $('[data-bt-stage]');
  function paintScene() {
    var s = checkedVal('bt-t');
    if (stage && s && stage.getAttribute('data-scene') !== s) stage.setAttribute('data-scene', s);
    return s;
  }

  /* ---------- open or closed: Call leads unless the shop is closed ---------- */
  var sticky = document.querySelector('[data-bc-sticky]');
  function applyOpen() {
    var ds = document.documentElement.getAttribute('data-bc-open');
    var own = root.getAttribute('data-open');
    var bar = sticky ? sticky.getAttribute('data-state') : null;
    var closed = (own === '0') || (own == null && (ds === '0' || (ds == null && bar === 'closed')));
    var acts = $('[data-bt-actions]');
    if (acts) acts.setAttribute('data-lead', closed ? 'text' : 'call');
    if (callEl) callEl.classList.toggle('is-primary', !closed);
    if (textEl) textEl.classList.toggle('is-primary', closed);
    if (acts && callEl && textEl) {
      var first = closed ? textEl : callEl, second = closed ? callEl : textEl;
      if (acts.firstElementChild !== first) acts.insertBefore(first, second);
    }
    showAll('[data-bt-closed]', closed);
  }
  if (window.MutationObserver) {
    new MutationObserver(applyOpen).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bc-open'] });
    if (sticky) new MutationObserver(applyOpen).observe(sticky, { attributes: true, attributeFilter: ['data-state'] });
    new MutationObserver(function () { render(); applyOpen(); }).observe(root, { attributes: true, attributeFilter: ['data-open', 'data-price-mode'] });
  }

  /* ---------- analytics: only through the site's existing gtag ---------- */
  var started = false, completed = false, touched = /[?&]b=/.test(location.search);
  function track(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) { /* never break the tool */ }
  }
  function base() {
    return { vehicle_class: state.vehicle, build_code: code(), panel_count: ORDER.filter(function (p) { return state.shade[p] > 0; }).length };
  }
  function start() { touched = true; if (!started) { started = true; track('config_start', base()); } }

  /* ---------- live announcement (short, only what changed) ---------- */
  var live = $('[data-bt-live]');
  function announce(msg) { if (live) { live.textContent = ''; live.textContent = msg; } }

  /* ---------- events ---------- */
  root.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || t.type !== 'radio') return;
    if (t.name === 'bt-t') {
      // Lighting only: not part of the build, the price, the code or the analytics.
      paintScene();
      return;
    }
    start();
    var price;
    if (t.name === 'bt-v') {
      state.vehicle = t.value;
      price = render();
      announce(fill(T.live_vehicle, { vehicle: cfg.vehicles[state.vehicle].label, price: price }));
    } else if (t.name === 'bt-p') {
      state.current = t.value;
      render();
      var v0 = state.shade[state.current];
      announce(cfg.panels[state.current].label + ' ' + shadeText(v0) + '. ' + legalFor(state.current, v0).long);
    } else if (t.name.indexOf('bt-s-') === 0) {
      var p = t.name.slice(5), v = parseInt(t.value, 10) || 0;
      state.shade[p] = v;
      state.current = p;
      price = render();
      announce(fill(T.live_change, { panel: cfg.panels[p].label, shade: shadeText(v), legal: legalFor(p, v).long, price: price }));
      var bp = base(); bp.panel = p; bp.shade = v;
      track('config_panel_change', bp);
    }
  });

  // Tapping a window in the illustration picks that panel (the radios stay the keyboard path).
  if (svg) {
    svg.addEventListener('click', function (e) {
      var g = e.target && e.target.closest ? e.target.closest('[data-glass]') : null;
      if (!g) return;
      var p = g.getAttribute('data-glass');
      if (!cfg.panels[p]) return;
      start();
      state.current = p;
      render();
      var r = root.querySelector('input[name="bt-p"][value="' + p + '"]');
      if (r) r.focus({ preventScroll: true });
    });
  }

  function complete(via) {
    if (completed) return;
    completed = true;
    start();
    var bp = base(); bp.method = via;
    track('config_complete', bp);
  }
  if (callEl) callEl.addEventListener('click', function () { complete('call'); });
  if (textEl) textEl.addEventListener('click', function () { complete('text'); });

  /* ---------- go ---------- */
  var picker = $('[data-bt-panels]');
  if (picker) picker.removeAttribute('hidden');
  root.classList.add('bt-ready');
  render();
  paintScene();
  applyOpen();
})();
