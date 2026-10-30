/* BC Glass & Tint v3, the build hand-off for the action system. Moved out of the core bundle
   (assets/v3/js/30-actions.js) in peak pass R1 so only the builder page carries it; the contract
   is unchanged. Runs before 50-builder.js (filename order), so it is listening before the builder's
   first bc:build.

   On bc:build { code, service, summary } the request and text links of the builder's own action
   ([data-bc-act][data-build="true"]) AND of the pinned controls (phone bar, menu sheet) carry the
   build: Request a time to /book?s=car&b=<code>, Text this build to an sms: link whose body is the
   labelled sentence plus the summary (Text links exist only while site.texts_confirmed is true).
   A detail with no code restores the plain links (FIXES-A item 1). */
(function () {
  "use strict";
  var PINNED = '[data-bc-act][data-slot="bar"], [data-bc-act][data-slot="drawer"]';
  function applyBuild(detail) {
    var code = detail && detail.code ? String(detail.code) : "";
    var summary = detail && detail.summary ? String(detail.summary) : "";
    var service = detail && detail.service ? String(detail.service) : "";
    var bodyEl = document.querySelector("[data-bc-act][data-build-body]");
    var body0 = bodyEl ? bodyEl.getAttribute("data-build-body") || "" : "";
    var acts = document.querySelectorAll('[data-bc-act][data-build="true"], ' + PINNED);
    for (var i = 0; i < acts.length; i++) {
      var el = acts[i];
      var body = (el.getAttribute("data-build-body") || body0).replace("{code}", code);
      var links = el.querySelectorAll("a[data-act]");
      for (var j = 0; j < links.length; j++) {
        var a = links[j], kind = a.getAttribute("data-act");
        if (kind !== "request" && kind !== "text") continue;
        if (a.getAttribute("data-href0") == null) a.setAttribute("data-href0", a.getAttribute("href"));
        var base = a.getAttribute("data-href0");
        if (kind === "request") {
          if (!code) { a.setAttribute("href", base); continue; }
          var parts = base.split("?"), qs = parts[1] || "";
          var kept = qs ? qs.split("&").filter(function (kv) { return kv && kv.split("=")[0] !== "b"; }) : [];
          if (service && !kept.some(function (kv) { return kv.split("=")[0] === "s"; })) kept.unshift("s=" + encodeURIComponent(service));
          kept.push("b=" + encodeURIComponent(code));
          a.setAttribute("href", parts[0] + "?" + kept.join("&"));
        } else {
          a.setAttribute("href", code ? "sms:" + base.replace(/^sms:/, "").split("?")[0] + "?&body=" + encodeURIComponent((body + (summary ? " " + summary : "")).trim()) : base);
        }
      }
    }
  }
  document.addEventListener("bc:build", function (e) { applyBuild(e && e.detail); });
})();
