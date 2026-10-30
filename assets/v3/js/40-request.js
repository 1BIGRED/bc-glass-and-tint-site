/* BC Glass & Tint v3, request form behavior (WS3). Bundled into /assets/h/core.<hash>.js.
   Markup and wording: _includes/v3/request.njk (form name "quote", the live Netlify form).

   What it does, for every form.v3-request[data-rq] on the page:
   1. Pre-fill. ?b=<build code> fills the hidden build_code field and, when the details box is
      empty, a plain summary of the build (on /book, through the book bundle's
      js/book/40-request-build.js, peak R1). ?s=car|home|blinds|chip|other picks the service. A value
      that is not a build code, or a service that is not on the list, is ignored without error.
      Nothing personal ever goes into a URL (a build code carries none).
   2. Lead source. utm_source, utm_medium, utm_campaign, gclid and a ref label (postcard, mail,
      truck, sign, card) are read from the URL, sanitized, kept for the browser session under the
      same sessionStorage key the v2 pages use (bcgt_leadsrc) and written into the hidden fields.
   3. Days. At most two of the day chips; a third is refused and the limit is announced through an
      aria-live note. A weekday whose every occurrence in the next 14 days is a shop closure is
      disabled.
   4. Submit. Required: name, phone, service. A request reference R-XXXXXX is made at the first
      submit and kept for retries. The form is POSTed url-encoded to "/" with fetch. SUCCESS MEANS
      A 2xx RESPONSE AND NOTHING ELSE: only then is the success panel shown, the sent record
      stored and the bc:lead event fired (50-events.js turns it into generate_lead). A failure
      (any non-2xx, or the network) keeps every field, shows the server-rendered message, fires
      bc:request-error and never bc:lead.
   5. Duplicates. While a send is in flight, after success, and for 30 minutes after a reload
      (sessionStorage, key bcgt_sent_<path>_<id>), a second submit is blocked and no second lead
      event can fire. The stored record holds the reference, the service, the build text and the
      days only, never a name, a phone number or free text.
   Without JavaScript (or without fetch) the form posts natively to /book/sent/.
   Test hook: window.bcRequest. */
(function () {
  "use strict";

  var B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; /* 32 characters, no I or O, no 0 or 1: readable aloud */
  var SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var SENT_MS = 30 * 60 * 1000;

  /* ---------- request reference ---------- */
  function makeRef() {
    var rnd = [], i, t = Date.now();
    try {
      var buf = new Uint8Array(6);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      for (i = 0; i < 6; i++) rnd.push(buf[i]);
    } catch (e) {
      for (i = 0; i < 6; i++) rnd.push(Math.floor(Math.random() * 256));
    }
    var s = "R-";
    for (i = 0; i < 6; i++) s += B32.charAt((rnd[i] ^ (t >> (5 * i))) & 31);
    return s;
  }

  /* ---------- build code ----------
     The build-code decoder, the ?b= pre-fill and the saved-build fallback are /book-only: they
     live in the "book" page bundle, assets/v3/js/book/40-request-build.js (peak R1, core JS trim),
     which registers window.bcRequestBuild(form, ctx) and window.bcRequest.decodeBuild. A form on
     any other page carries no build (every "with this build" link goes to /book). */

  /* ---------- lead source (same rules and storage key as the v2 capture script) ---------- */
  var LS_KEY = "bcgt_leadsrc";
  var REF_LABELS = { postcard: "Postcard", mail: "Mail", truck: "Truck", sign: "Sign", card: "Card" };
  var UTM_RE = /^[a-z0-9._-]{1,40}$/;
  var GCLID_RE = /^[A-Za-z0-9_-]{10,200}$/;

  function readLeadSource() {
    var cur = null, p, utm_source, utm_medium, utm_campaign, gclid, ref, d;
    try {
      var raw = window.sessionStorage.getItem(LS_KEY);
      if (raw) { cur = JSON.parse(raw); if (!cur || typeof cur !== "object") cur = null; }
    } catch (e) { cur = null; }
    if (cur) return cur;
    try { p = new URLSearchParams(window.location.search); } catch (e2) { return null; }
    function low(k) { var v = (p.get(k) || "").toLowerCase(); return UTM_RE.test(v) ? v : ""; }
    utm_source = low("utm_source");
    utm_medium = low("utm_medium");
    utm_campaign = low("utm_campaign");
    gclid = p.get("gclid") || "";
    if (!GCLID_RE.test(gclid)) gclid = "";
    ref = (p.get("ref") || "").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(REF_LABELS, ref)) ref = "";
    if (!utm_source && !utm_medium && !utm_campaign && !gclid && !ref) return null;
    d = { utm_source: utm_source, utm_medium: utm_medium, utm_campaign: utm_campaign, gclid: gclid, ref: ref };
    if (utm_source || utm_medium) d.lead_source = utm_source && utm_medium ? utm_source + " / " + utm_medium : utm_source || utm_medium;
    else d.lead_source = ref ? REF_LABELS[ref] : "";
    try { window.sessionStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e3) { /* storage blocked */ }
    return d;
  }

  /* ---------- closed weekdays ---------- */
  /* cfg is the #bc-hours block ({ tz, closures: [{ date, reason }] }). Returns the short weekday
     names whose every occurrence in the next 14 days (tomorrow on) is a closure. */
  function closedWeekdays(cfg, now) {
    var out = [];
    try {
      var tz = (cfg && cfg.tz) || "America/Los_Angeles";
      var ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(now || new Date()).split("-").map(Number);
      var closed = {}, total = {}, set = {}, i, d, wd, ds;
      ((cfg && cfg.closures) || []).forEach(function (c) { if (c && c.date) set[c.date] = true; });
      for (i = 1; i <= 14; i++) {
        d = new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2] + i, 12));
        wd = SHORT[d.getUTCDay()];
        ds = d.toISOString().slice(0, 10);
        total[wd] = (total[wd] || 0) + 1;
        if (set[ds]) closed[wd] = (closed[wd] || 0) + 1;
      }
      Object.keys(total).forEach(function (k) { if (closed[k] === total[k]) out.push(k); });
    } catch (e) { /* no Intl or bad data: nothing is disabled */ }
    return out;
  }

  function readHoursCfg() {
    try {
      var el = document.getElementById("bc-hours");
      return el ? JSON.parse(el.textContent) : null;
    } catch (e) { return null; }
  }

  /* ---------- helpers ---------- */
  function fire(name, detail) {
    try {
      var ev;
      if (typeof CustomEvent === "function") ev = new CustomEvent(name, { detail: detail });
      else { ev = document.createEvent("CustomEvent"); ev.initCustomEvent(name, false, false, detail); }
      document.dispatchEvent(ev);
    } catch (e) { /* a tracking failure must never reach the visitor */ }
  }

  function digitCount(s) { return String(s || "").replace(/\D/g, "").length; }

  function setField(form, name, value) {
    var el = form.querySelector('[name="' + name + '"]');
    if (el && value) el.value = value;
  }

  function sentKey(id) { return "bcgt_sent_" + location.pathname + "_" + id; }

  function readSent(id) {
    try {
      var rec = JSON.parse(window.sessionStorage.getItem(sentKey(id)));
      if (rec && typeof rec === "object" && rec.t && Date.now() - rec.t < SENT_MS && /^R-[A-Z0-9]{6}$/.test(rec.ref || "")) return rec;
    } catch (e) { /* storage blocked or unreadable */ }
    return null;
  }

  function writeSent(id, rec) {
    try { window.sessionStorage.setItem(sentKey(id), JSON.stringify(rec)); } catch (e) { /* storage blocked */ }
  }

  /* ---------- one form ---------- */
  function setup(form) {
    var id = form.getAttribute("data-rq-id") || "rq";
    var panel = form.nextElementSibling && form.nextElementSibling.hasAttribute("data-rq-sent") ? form.nextElementSibling : null;
    var btn = form.querySelector('button[type="submit"]');
    var fail = form.querySelector("[data-rq-fail]");
    var nameEl = form.elements.name, phoneEl = form.elements.phone, svcEl = form.elements.service;
    var detailsEl = form.elements.details;
    var daysBox = form.querySelector("[data-rq-days]");
    var dayNote = form.querySelector("[data-rq-days-note]");
    var buildNote = form.querySelector("[data-rq-build-note]");
    var st = { done: false, sending: false, ref: "", buildText: "" };

    form.noValidate = true; /* our own messages replace the browser bubbles; without JS the native ones stay */

    /* 1. pre-fill: ?s= picks the service here; on /book the book bundle fills a build (?b=, else the
       build saved on this browser, FIXES-A item 1) through window.bcRequestBuild */
    var q = null;
    try { q = new URLSearchParams(window.location.search); } catch (e) { q = null; }
    if (q) {
      var s = (q.get("s") || "").toLowerCase();
      if (/^[a-z]{2,10}$/.test(s) && svcEl) {
        var i, opt;
        for (i = 0; i < svcEl.options.length; i++) {
          opt = svcEl.options[i];
          if (opt.getAttribute("data-key") === s) { svcEl.selectedIndex = i; break; }
        }
      }
    }

    if (typeof window.bcRequestBuild === "function") {
      try {
        window.bcRequestBuild(form, { st: st, query: q, setField: setField, details: detailsEl, service: svcEl, buildNote: buildNote });
      } catch (eB) { /* a build pre-fill must never stop the form */ }
    }

    /* 2. lead source */
    var ls = readLeadSource();
    if (ls) {
      setField(form, "utm_source", ls.utm_source);
      setField(form, "utm_medium", ls.utm_medium);
      setField(form, "utm_campaign", ls.utm_campaign);
      setField(form, "gclid", ls.gclid);
      setField(form, "lead_source", ls.lead_source);
    }

    /* 3. days */
    var boxes = daysBox ? Array.prototype.slice.call(daysBox.querySelectorAll('input[name="days"]')) : [];
    var limitMsg = daysBox ? daysBox.getAttribute("data-limit-msg") || "" : "";
    var closedWord = daysBox ? daysBox.getAttribute("data-closed-word") || "" : "";
    function say(msg) {
      if (!dayNote) return;
      dayNote.textContent = "";
      if (msg) window.setTimeout(function () { dayNote.textContent = msg; }, 30);
    }
    function checkedBoxes() { return boxes.filter(function (x) { return x.checked; }); }
    boxes.forEach(function (bx) {
      bx.addEventListener("change", function () {
        var n = checkedBoxes().length;
        if (n > 2) { bx.checked = false; say(limitMsg); return; }
        say(n === 2 ? limitMsg : "");
      });
    });
    var shut = closedWeekdays(readHoursCfg(), new Date());
    boxes.forEach(function (bx) {
      if (shut.indexOf(bx.getAttribute("data-day")) > -1) {
        bx.disabled = true;
        var lbl = bx.nextElementSibling;
        if (lbl && closedWord) lbl.appendChild(document.createTextNode(" (" + closedWord + ")"));
      }
    });
    function dayLabels() {
      return checkedBoxes().map(function (x) { return (x.nextElementSibling ? x.nextElementSibling.textContent : x.value).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); });
    }

    /* 4. validation */
    function errEl(key) { return form.querySelector('[data-rq-err="' + key + '"]'); }
    function mark(key, input, bad) {
      var p = errEl(key);
      if (p) p.hidden = !bad;
      if (!input) return;
      input.setAttribute("aria-invalid", bad ? "true" : "false");
      if (bad && p) input.setAttribute("aria-describedby", p.id);
      else input.removeAttribute("aria-describedby");
    }
    function validate() {
      var bad = [];
      var nOk = !!(nameEl && nameEl.value.replace(/\s+/g, "") !== "");
      var pOk = !!(phoneEl && digitCount(phoneEl.value) >= 10 && digitCount(phoneEl.value) <= 15);
      var sOk = !!(svcEl && svcEl.value);
      mark("name", nameEl, !nOk);
      mark("phone", phoneEl, !pOk);
      mark("service", svcEl, !sOk);
      if (!nOk) bad.push(nameEl);
      if (!pOk) bad.push(phoneEl);
      if (!sOk) bad.push(svcEl);
      return bad;
    }
    [["name", nameEl], ["phone", phoneEl], ["service", svcEl]].forEach(function (pair) {
      var el = pair[1];
      if (!el) return;
      el.addEventListener(pair[0] === "service" ? "change" : "input", function () {
        if (el.getAttribute("aria-invalid") === "true") {
          var ok = pair[0] === "phone" ? digitCount(el.value) >= 10 : pair[0] === "name" ? el.value.replace(/\s+/g, "") !== "" : !!el.value;
          if (ok) mark(pair[0], el, false);
        }
      });
    });

    /* 5. success state */
    function serviceKey() {
      var o = svcEl && svcEl.options[svcEl.selectedIndex];
      return (o && o.getAttribute("data-key")) || "other";
    }
    function recapRow(key, text) {
      if (!panel) return;
      var row = panel.querySelector('[data-rq-recap="' + key + '"]');
      if (!row) return;
      var dd = row.querySelector("dd");
      if (dd) dd.textContent = text || "";
      row.hidden = !text;
    }
    function showSent(rec, quiet) {
      st.done = true;
      form.hidden = true;
      if (panel) {
        recapRow("service", rec.svc);
        recapRow("build", rec.build);
        recapRow("days", (rec.days || []).join(", "));
        recapRow("ref", rec.ref);
        var note = panel.querySelector("[data-rq-ref-note]");
        if (note) note.hidden = !rec.ref;
        panel.hidden = false;
        if (!quiet) {
          try { panel.focus({ preventScroll: true }); } catch (e) { panel.focus(); }
          try { panel.scrollIntoView({ block: "start" }); } catch (e2) { /* old browser */ }
        }
      }
    }
    function busy(on) {
      st.sending = on;
      if (!btn) return;
      btn.disabled = on;
      btn.setAttribute("aria-busy", on ? "true" : "false");
      btn.textContent = on ? btn.getAttribute("data-sending") || "Sending" : btn.getAttribute("data-label") || btn.textContent;
    }

    function onOk() {
      var rec = {
        t: Date.now(),
        ref: st.ref,
        svc: svcEl && svcEl.value ? svcEl.value : "",
        build: st.buildText,
        days: dayLabels()
      };
      busy(false);
      if (fail) fail.hidden = true;
      writeSent(id, rec);
      showSent(rec, false);
      /* The one and only place a lead event is raised: after a 2xx response. */
      fire("bc:lead", {
        ref: rec.ref,
        service: serviceKey(),
        has_build: !!st.buildText,
        days_count: rec.days.length
      });
    }
    function onFail(reason) {
      busy(false);
      if (fail) {
        fail.hidden = false;
        try { fail.scrollIntoView({ block: "center" }); } catch (e) { /* old browser */ }
      }
      fire("bc:request-error", { reason: reason });
    }

    form.addEventListener("submit", function (e) {
      if (st.done || st.sending) { e.preventDefault(); return; }
      var bad = validate();
      if (bad.length) {
        e.preventDefault();
        try { bad[0].focus(); } catch (x) { /* ignore */ }
        return;
      }
      if (!st.ref) st.ref = makeRef();
      setField(form, "ref", st.ref);
      setField(form, "status_state", document.documentElement.getAttribute("data-status-state") || "");
      var code = form.elements.build_code ? form.elements.build_code.value : "";
      var svcVal = svcEl.value;
      if (form.elements.subject) {
        form.elements.subject.value = "Website request " + st.ref + (svcVal ? ", " + svcVal : "") + (code ? ", " + code : "");
      }
      if (typeof window.fetch !== "function") return; /* native post to /book/sent/ */
      var body;
      try { body = new URLSearchParams(new FormData(form)).toString(); } catch (x2) { return; }
      e.preventDefault();
      if (fail) fail.hidden = true;
      busy(true);
      var p;
      try {
        p = window.fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body });
      } catch (x3) {
        onFail("network");
        return;
      }
      p.then(function (r) {
        if (r && r.ok) onOk();
        else onFail("http_" + (r && r.status ? r.status : 0));
      }, function () { onFail("network"); });
    });

    /* restore the sent state after a reload or Back, so it never looks like the send failed and
       invites a duplicate */
    function restore() {
      if (st.done) return;
      var rec = readSent(id);
      if (rec) { st.ref = rec.ref; showSent(rec, true); }
    }
    restore();
    window.addEventListener("pageshow", restore);

    return { form: form, state: st };
  }

  function init() {
    var forms = document.querySelectorAll("form.v3-request[data-rq]");
    var handles = [], i;
    for (i = 0; i < forms.length; i++) handles.push(setup(forms[i]));
    window.bcRequest.forms = handles;
  }

  window.bcRequest = window.bcRequest || {};
  window.bcRequest.makeRef = makeRef;
  window.bcRequest.closedWeekdays = closedWeekdays;
  window.bcRequest.forms = [];

  /* DOMContentLoaded fires after every deferred script has run, so the book bundle (loaded after
     core on /book) has registered window.bcRequestBuild before the forms are set up. A deferred
     script runs while readyState is already "interactive", so only "complete" means
     DOMContentLoaded is behind us; the load listener is a backstop, the flag keeps one run. */
  var started = false;
  function startOnce() { if (started) return; started = true; init(); }
  if (document.readyState === "complete") startOnce();
  else {
    document.addEventListener("DOMContentLoaded", startOnce);
    window.addEventListener("load", startOnce);
  }
})();
