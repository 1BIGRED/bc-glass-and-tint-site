/* BC Glass & Tint v3, analytics events (WS3). Replaces _includes/js/gtag-events.njk for v3 pages.
   Bundled into /assets/h/core.<hash>.js. Delegated listeners only; nothing is attached per element.

   Rules (CEO rulings, engineering 3.4):
   - generate_lead is sent from ONE place: the bc:lead event that 40-request.js raises after a 2xx
     response, once per request reference (a Set, also kept in sessionStorage so a reload cannot
     repeat one). Never on a click, never on a failure, never from a submit listener.
   - No personal data in any event parameter: no name, phone, email or free text. Every value goes
     through clean(); the only parameters ever sent are the fixed ones listed below.
   - Every event carries page (path only, no query), section (the nearest [data-section]) and
     status_state (the <html data-status-state> value the action system sets, else "na").

   Events: call_click, text_click, email_click, router_click, price_view, build_start, preset_pick,
   panel_change, addon_toggle, build_complete (builder.js raises bc:ev), form_start, generate_lead,
   request_error, gift_card_click, directions_click, review_click, cookie_banner_shown,
   cookie_accept. Test hook: window.bcEvents. */
(function () {
  "use strict";

  /* ---------- sanitizing ---------- */
  /* A string parameter is dropped when it could hold personal data: longer than 60 characters, an
     "@", or seven or more digits even with spaces, dots, dashes or brackets between them. Numbers
     and booleans pass. */
  var PHONELIKE = /\d[\s().-]*\d[\s().-]*\d[\s().-]*\d[\s().-]*\d[\s().-]*\d[\s().-]*\d/;
  function clean(v) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return isFinite(v) ? v : undefined;
    if (typeof v !== "string") return undefined;
    if (v.length > 60 || v.indexOf("@") > -1 || PHONELIKE.test(v)) return undefined;
    return v;
  }

  function pagePath() {
    return (window.location.pathname || "/").slice(0, 100);
  }
  function stateOf() {
    return document.documentElement.getAttribute("data-status-state") || "na";
  }
  function sectionOf(el) {
    var s = el && el.closest ? el.closest("[data-section]") : null;
    return s ? s.getAttribute("data-section") || "" : "";
  }

  function send(name, params, el) {
    var p = {}, k, v;
    params = params || {};
    for (k in params) {
      if (Object.prototype.hasOwnProperty.call(params, k)) {
        v = clean(params[k]);
        if (v !== undefined) p[k] = v;
      }
    }
    p.page = pagePath();
    p.section = sectionOf(el);
    p.status_state = stateOf();
    if (typeof window.gtag === "function") window.gtag("event", name, p);
    return p;
  }

  /* ---------- clicks ----------
     The v2 script sent link_url (the tel:, sms: or mailto: address). v3 sends link_type instead: those
     addresses carry a phone number or an email, and the rule is no phone or email in any event. */
  var SQUARE = /(^|\.)(squareup\.com|square\.site|square\.link)$/i;
  function hostOf(h) {
    try { return new URL(h, window.location.href).hostname; } catch (e) { return ""; }
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var tagged = t.closest("[data-ev]");
    var a = t.closest("a[href]");
    var h, txt, name, path;

    if (tagged) {
      name = tagged.getAttribute("data-ev");
      if (name === "router_click") {
        path = tagged.getAttribute("data-ev-path") || "";
        send("router_click", { path: /^[a-z0-9_-]{1,30}$/.test(path) ? path : "" }, tagged);
        return;
      }
      if (name === "gift_card_click") {
        send("gift_card_click", { link_host: hostOf(a ? a.getAttribute("href") : "") }, tagged);
        return;
      }
    }
    if (!a) return;
    h = a.getAttribute("href") || "";
    if (h.indexOf("tel:") === 0) {
      send("call_click", { link_type: "tel" }, a);
    } else if (h.indexOf("sms:") === 0) {
      var pre = a.getAttribute("data-prefill");
      if (!pre) pre = /[?&]body=/i.test(h) ? (/BC-/i.test(decodeURIComponent_safe(h)) ? "build" : "plain") : "plain";
      send("text_click", { link_type: "sms", prefill: pre === "build" || pre === "chip_photo" ? pre : "plain" }, a);
    } else if (h.indexOf("mailto:") === 0) {
      send("email_click", { link_type: "mailto" }, a);
    } else if (SQUARE.test(hostOf(h))) {
      send("gift_card_click", { link_host: hostOf(h) }, a);
    } else if (h.indexOf("google.com/maps") > -1) {
      txt = (a.textContent || "").toLowerCase();
      if (txt.indexOf("direction") > -1) send("directions_click", { link_type: "maps" }, a);
      else send("review_click", { platform: "google" }, a);
    } else if (h.indexOf("yelp.com") > -1) {
      send("review_click", { platform: "yelp" }, a);
    } else if (h.indexOf("tintwiz.me") > -1) {
      send("review_click", { platform: "tintwiz" }, a);
    }
  }
  function decodeURIComponent_safe(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }
  document.addEventListener("click", onClick, true);

  /* ---------- form_start: first focus inside the request form, once per form ---------- */
  document.addEventListener("focusin", function (e) {
    var f = e.target && e.target.closest ? e.target.closest('form[name="quote"]') : null;
    if (!f || f.getAttribute("data-ev-started") === "1") return;
    f.setAttribute("data-ev-started", "1");
    send("form_start", { form_name: "quote" }, f);
  }, true);

  /* ---------- generate_lead and request_error ---------- */
  var SENT_KEY = "bc_leads_sent";
  var leads = {};
  try {
    JSON.parse(window.sessionStorage.getItem(SENT_KEY) || "[]").forEach(function (r) { leads[r] = true; });
  } catch (e) { leads = {}; }
  function rememberLead(ref) {
    leads[ref] = true;
    try { window.sessionStorage.setItem(SENT_KEY, JSON.stringify(Object.keys(leads).slice(-20))); } catch (e) { /* storage blocked */ }
  }

  document.addEventListener("bc:lead", function (e) {
    var d = (e && e.detail) || {};
    if (!/^R-[A-Z0-9]{6}$/.test(d.ref || "") || leads[d.ref]) return; /* once per request reference */
    rememberLead(d.ref);
    send("generate_lead", {
      form_name: "quote",
      service: /^[a-z]{2,10}$/.test(d.service || "") ? d.service : "other",
      has_build: !!d.has_build,
      days_count: Math.max(0, Math.min(2, parseInt(d.days_count, 10) || 0)),
      ref: d.ref
    }, document.querySelector('form[name="quote"]'));
  });

  document.addEventListener("bc:request-error", function (e) {
    var r = e && e.detail ? e.detail.reason : "";
    send("request_error", { form_name: "quote", reason: /^(http_\d{3}|network)$/.test(r || "") ? r : "unknown" },
      document.querySelector('form[name="quote"]'));
  });

  /* ---------- builder and consent events: bc:ev { name, params } ---------- */
  var FORWARD = {
    build_start: 1, preset_pick: 1, panel_change: 1, addon_toggle: 1, build_complete: 1,
    cookie_banner_shown: 1, cookie_accept: 1
  };
  document.addEventListener("bc:ev", function (e) {
    var d = (e && e.detail) || {};
    if (!FORWARD[d.name]) return;
    send(d.name, d.params || {}, e.target && e.target.nodeType === 1 ? e.target : null);
  });

  /* ---------- price_view: a price block first enters view, once per block per page view ----------
     Blocks present at load are observed at once; blocks a script adds later (the builder) are
     picked up by a MutationObserver. */
  function watchPrices() {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var svc = en.target.closest("[data-service]");
        var s = svc ? svc.getAttribute("data-service") || "" : "";
        send("price_view", {
          service: /^[a-z0-9_-]{1,20}$/.test(s) ? s : "",
          mode: document.documentElement.getAttribute("data-price-mode") || ""
        }, en.target);
      });
    }, { threshold: 0.5 });
    function take(root) {
      var list = [];
      if (root.nodeType !== 1) return;
      if (root.matches && root.matches("[data-price-block]")) list.push(root);
      if (root.querySelectorAll) Array.prototype.push.apply(list, root.querySelectorAll("[data-price-block]"));
      list.forEach(function (b) {
        if (b.getAttribute("data-ev-pv") === "1") return;
        b.setAttribute("data-ev-pv", "1");
        io.observe(b);
      });
    }
    take(document.documentElement);
    if (typeof MutationObserver === "function") {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, take); });
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchPrices);
  else watchPrices();

  window.bcEvents = { send: send, clean: clean };
})();
