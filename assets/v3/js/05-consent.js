/* BC Glass & Tint v3, consent (WS3). Replaces _includes/js/cookie.njk for v3 pages.
   Bundled into /assets/h/core.<hash>.js; the 05 prefix keeps it ahead of the other scripts.

   Policy is unchanged (client rule): analytics is ON by default, the banner offers Decline, and the
   choice is stored as bcgt_analytics = yes | no in localStorage and a first-party cookie (the same
   key as the v2 site, so an existing visitor's choice carries over).

   Fixes over the v2 script (engineering 3.5):
   1. Decline sets analytics_storage, ad_storage AND ad_user_data to denied (v2 set only
      analytics_storage). Accept sets all three to granted. ad_personalization is never granted
      (head/ga4.njk denies it by default and this script never updates it).
   2. No inline scrollPaddingBottom. The bar height is published as --ckh on <html>; the CSS adds
      it to scroll-padding-bottom so focus is never hidden behind the bar.
   3. On Decline the GA, Google Ads and Clarity cookies are removed on every parent domain, and
      Clarity is stopped.
   Markup: _includes/v3/cookie-bar.njk (#v3-ck, #v3-ck-yes, #v3-ck-no). The footer link #ckreopen
   (or any [data-cookie-reopen]) shows the bar again. Test hook: window.bcConsent. */
(function () {
  "use strict";
  var K = "bcgt_analytics";
  var bar, gaId = "", live = false, opener = null, ro = null;

  function readChoice() {
    var v = null;
    try { v = localStorage.getItem(K); } catch (e) { v = null; }
    if (!v) {
      try {
        var m = document.cookie.match(/(?:^|;\s*)bcgt_analytics=(yes|no)/);
        if (m) v = m[1];
      } catch (e2) { v = null; }
    }
    return v === "yes" || v === "no" ? v : null;
  }

  function writeChoice(v) {
    try { localStorage.setItem(K, v); } catch (e) { /* storage blocked: the cookie below still holds the choice */ }
    try {
      document.cookie = K + "=" + v + ";path=/;max-age=31536000;SameSite=Lax" + (location.protocol === "https:" ? ";Secure" : "");
    } catch (e2) { /* cookies blocked: nothing to remove later either */ }
  }

  /* Every host suffix to clear a cookie on: a.b.example.com -> a.b.example.com, b.example.com,
     example.com, so a cookie set on a parent domain is removed too. */
  function domainsFor(host) {
    var parts = host.split("."), out = [""], i;
    if (parts.length < 2 || /^\d+(\.\d+){3}$/.test(host)) return out;
    for (i = 0; i <= parts.length - 2; i++) out.push("." + parts.slice(i).join("."));
    return out;
  }

  function expireCookie(name) {
    var gone = "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/", ds = domainsFor(location.hostname), i;
    for (i = 0; i < ds.length; i++) {
      document.cookie = name + gone + (ds[i] ? ";domain=" + ds[i] : "");
    }
  }

  /* Google Analytics (_ga, _ga_<id>, _gid, _gat*), Google Ads (_gcl_*), Microsoft Clarity
     (_clck, _clsk, CLID, MUID, ANONCHK, SM). */
  var OURS = /^(_ga|_gid|_gat|_gcl_|_clck|_clsk|CLID$|MUID$|ANONCHK$|SM$)/;

  function clearTrackingCookies() {
    try {
      document.cookie.split(";").forEach(function (c) {
        var n = c.split("=")[0].replace(/^\s+|\s+$/g, "");
        if (n && OURS.test(n)) expireCookie(n);
      });
    } catch (e) { /* nothing to clear */ }
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (/^(_clck|_clsk|CLID|clarity)/.test(k)) localStorage.removeItem(k);
      });
    } catch (e2) { /* storage blocked */ }
  }

  function stopClarity() {
    try { if (typeof window.clarity === "function") window.clarity("stop"); } catch (e) { /* not loaded */ }
  }

  function consentUpdate(v) {
    var s = v === "no" ? "denied" : "granted";
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: s, ad_storage: s, ad_user_data: s });
    }
  }

  function note(name) {
    /* cookie_banner_shown and cookie_accept ride the same event path as every other event
       (page, section, status_state); 50-events.js forwards bc:ev. */
    try {
      var ev;
      if (typeof CustomEvent === "function") ev = new CustomEvent("bc:ev", { detail: { name: name, params: {} } });
      else { ev = document.createEvent("CustomEvent"); ev.initCustomEvent("bc:ev", false, false, { name: name, params: {} }); }
      document.dispatchEvent(ev);
    } catch (e) { /* analytics must never break the page */ }
  }

  function publishHeight() {
    try {
      var h = Math.ceil(bar.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--ckh", h + "px");
    } catch (e) { /* layout not ready */ }
  }

  function show(fromUser) {
    bar.hidden = false;
    document.body.classList.add("ck-open");
    publishHeight();
    if (typeof ResizeObserver === "function" && !ro) {
      ro = new ResizeObserver(publishHeight);
      ro.observe(bar);
    }
    if (fromUser) {
      try { bar.focus({ preventScroll: true }); } catch (e) { bar.focus(); }
    }
  }

  function hide() {
    var hadFocus = bar.contains(document.activeElement);
    bar.hidden = true;
    document.body.classList.remove("ck-open");
    try { document.documentElement.style.removeProperty("--ckh"); } catch (e) { /* ignore */ }
    if (ro) { try { ro.disconnect(); } catch (e2) { /* ignore */ } ro = null; }
    /* The control that had focus just disappeared: hand focus back to what opened the bar, or to
       the page, so a keyboard user is not dropped at the top of the document. */
    if (hadFocus) {
      var target = opener && document.contains(opener) ? opener : document.getElementById("main");
      if (target && target.focus) {
        try { target.focus({ preventScroll: true }); } catch (e3) { target.focus(); }
      }
    }
    opener = null;
  }

  function choose(v) {
    writeChoice(v);
    consentUpdate(v);
    if (v === "no") {
      if (gaId) window["ga-disable-" + gaId] = true;
      clearTrackingCookies();
      stopClarity();
    } else {
      /* only a build that really loads analytics may switch it back on; a staging, preview or
         noindex build keeps the stub head/ga4.njk set */
      if (gaId && live) window["ga-disable-" + gaId] = false;
      if (typeof window.__bcgtLoadGa === "function") window.__bcgtLoadGa();
      if (typeof window.__bcgtLoadClarity === "function") window.__bcgtLoadClarity();
      note("cookie_accept");
    }
    hide();
  }

  function init() {
    bar = document.getElementById("v3-ck");
    if (!bar) return; /* a page without the v3 bar (a v2 page) keeps its own script */
    gaId = bar.getAttribute("data-ga-id") || "";
    live = bar.getAttribute("data-analytics") === "true";
    var yes = document.getElementById("v3-ck-yes"), no = document.getElementById("v3-ck-no");
    if (yes) yes.addEventListener("click", function () { choose("yes"); });
    if (no) no.addEventListener("click", function () { choose("no"); });
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("#ckreopen, [data-cookie-reopen]") : null;
      if (!a) return;
      e.preventDefault();
      opener = a;
      show(true);
    });
    if (readChoice() === null) {
      show(false);
      note("cookie_banner_shown");
    }
    window.bcConsent = {
      read: readChoice,
      choose: choose,
      show: show,
      clearTrackingCookies: clearTrackingCookies
    };
  }

  /* DOMContentLoaded fires after every deferred script has run, so 50-events.js is listening before
     the first event (cookie_banner_shown) is raised. A deferred script runs while readyState is
     already "interactive", so only "complete" means DOMContentLoaded is behind us. The load listener
     is a backstop for a script injected late; the flag keeps init to one run. */
  var started = false;
  function startOnce() { if (started) return; started = true; init(); }
  if (document.readyState === "complete") startOnce();
  else {
    document.addEventListener("DOMContentLoaded", startOnce);
    window.addEventListener("load", startOnce);
  }
})();
