/* BC Glass & Tint v3, page moments (WS5). Core bundle, so every part guards on its own markup.
   1. Vehicle class switch on price rows ([data-class-switch]): reveals the switch (hidden without
      JS, so Car shows) and swaps the pre-rendered panes. No layout shift: panes share one slot.
   2. Shade preview ([data-shade-preview]): chip select swaps the numeral, the pane and the meter
      (120 ms, art direction 4.3); front-door legality line from data-front.
   3. Glare to Calm ([data-glare-once]): once per session, when the preview is 40 percent in view,
      a glare layer over it fades out over 600 ms (art direction 4.3). Never on load of the first
      view, never under reduced motion. sessionStorage access is wrapped in try/catch.
   4. Dated closure facts ([data-closures]): from the same #bc-hours config the action system reads,
      only closures within the next 21 days (engineering 2.3, blueprint 3.9). No-JS visitors see
      the printed weekly hours only. */
(function () {
  "use strict";
  var doc = document;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1. Class switch. A class the visitor picks also rides into every "Build your tint" link on the
  //    page ([data-build-link]) as /build-your-tint?class=<id>; the builder preselects that vehicle
  //    and nothing else (integration pass, CEO ruling 2026-10-29). Until a class is picked the links
  //    stay plain, so no vehicle is chosen for anyone who did not choose one.
  var switches = doc.querySelectorAll("[data-class-switch]");
  function carryClass(v) {
    if (!/^[a-z]{2,12}$/.test(v)) return;
    Array.prototype.forEach.call(doc.querySelectorAll("a[data-build-link]"), function (a) {
      if (a.getAttribute("data-href0") == null) a.setAttribute("data-href0", a.getAttribute("href"));
      var base = a.getAttribute("data-href0").split("?")[0].split("#")[0];
      a.setAttribute("href", base + "?class=" + encodeURIComponent(v));
    });
  }
  Array.prototype.forEach.call(switches, function (box) {
    var seg = box.querySelector("[data-class-seg]");
    if (!seg) return;
    seg.hidden = false;
    seg.addEventListener("change", function (e) {
      var v = e.target && e.target.value;
      if (!v) return;
      Array.prototype.forEach.call(box.querySelectorAll(".ws5-classpane"), function (p) {
        p.classList.toggle("is-on", p.getAttribute("data-class") === v);
      });
      carryClass(v);
    });
  });

  // 2. Shade preview
  var previews = doc.querySelectorAll("[data-shade-preview]");
  Array.prototype.forEach.call(previews, function (box) {
    var num = box.querySelector("[data-shade-num]");
    var pane = box.querySelector("[data-shade-pane]");
    var meter = box.querySelector("[data-shade-meter]");
    var legal = box.querySelector("[data-shade-legal]");
    var chips = box.querySelectorAll(".ws5-chip");
    function pick(chip) {
      Array.prototype.forEach.call(chips, function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
      var vlt = chip.getAttribute("data-vlt");
      if (num) num.textContent = vlt;
      if (pane) pane.style.setProperty("--pane-a", chip.getAttribute("data-alpha"));
      if (meter) meter.style.transform = "scaleX(" + Number(vlt) / 100 + ")";
      if (legal) legal.textContent = chip.getAttribute("data-front") === "yes" ? legal.getAttribute("data-ok") : legal.getAttribute("data-no");
    }
    Array.prototype.forEach.call(chips, function (c) {
      c.addEventListener("click", function () { pick(c); });
    });
  });

  // 3. Glare to Calm, once per session
  var KEY = "bc_glare_seen";
  function seen() { try { return window.sessionStorage.getItem(KEY) === "1"; } catch (e) { return true; } }
  function mark() { try { window.sessionStorage.setItem(KEY, "1"); } catch (e) {} }
  var glare = doc.querySelector("[data-glare-once]");
  if (glare && !reduce && !seen() && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || en.intersectionRatio < 0.4) return;
        io.disconnect();
        mark();
        glare.classList.add("is-glare");
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            glare.classList.add("is-calm");
            glare.classList.remove("is-glare");
          });
        });
      });
    }, { threshold: [0.4] });
    io.observe(glare);
  }

  // 5. Q&A search: moved to the qa page bundle, assets/v3/js/qa/50-qa.js (peak pass R1).

  // 6. Contact block request form ([data-talk-form]): a disclosure, open from 1024 px and whenever
  //    the visitor arrives on or jumps to #quote, so the long form does not lengthen the phone page.
  var forms = doc.querySelectorAll("[data-talk-form]");
  if (forms.length) {
    var wide = window.matchMedia && window.matchMedia("(min-width: 1024px)").matches;
    var openForms = function () { Array.prototype.forEach.call(forms, function (d) { d.open = true; }); };
    if (wide || location.hash === "#quote") openForms();
    window.addEventListener("hashchange", function () { if (location.hash === "#quote") openForms(); });
  }

  // 4. Dated closure facts
  var slots = doc.querySelectorAll("[data-closures]");
  var cfgEl = doc.getElementById("bc-hours");
  if (slots.length && cfgEl) {
    var cfg = null;
    try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { cfg = null; }
    var list = (cfg && cfg.closures) || [];
    var now = new Date();
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    // Peak pass R2 (psychology R1 #10): a slot may look further ahead (data-days, default 21), e.g. the
    // holiday hours on /gift-cards. Only owner-confirmed site.json closures are ever printed.
    var factsWithin = function (n) {
      var horizon = now.getTime() + n * 86400000;
      var out = [];
      list.forEach(function (c) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c && c.date ? c.date : "");
        if (!m) return;
        var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
        var end = d.getTime() + 12 * 3600000;
        if (end < now.getTime() || d.getTime() > horizon) return;
        out.push({ d: d, reason: c.reason || "" });
      });
      return out;
    };
    Array.prototype.forEach.call(slots, function (slot) {
      var n = parseInt(slot.getAttribute("data-days") || "21", 10);
      var facts = factsWithin(n > 0 && n < 120 ? n : 21);
      if (!facts.length) return;
      (function () {
        var tpl = slot.getAttribute("data-fact") || "Closed {reason}, {date}.";
        var txt = facts.map(function (f) {
          var label = days[f.d.getUTCDay()] + " " + months[f.d.getUTCMonth()] + " " + f.d.getUTCDate();
          var reason = f.reason ? (/^the /i.test(f.reason) ? f.reason : "for " + f.reason) : "";
          return tpl.replace("{reason}", reason).replace("{date}", label).replace("  ", " ");
        }).join(" ");
        slot.textContent = (slot.getAttribute("data-intro") ? slot.getAttribute("data-intro") + " " : "") + txt;
        slot.hidden = false;
      })();
    });
  }

  // 5. Seasonal lines (peak pass R2): printed at build time inside their window; a visitor who arrives
  // after data-season-to (Pacific date) does not see a stale one.
  var seasonal = doc.querySelectorAll("[data-season-to]");
  if (seasonal.length) {
    var today = "";
    try { today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { today = ""; }
    Array.prototype.forEach.call(seasonal, function (el) {
      var to = el.getAttribute("data-season-to") || "";
      if (today && to && today > to) el.hidden = true;
    });
  }
})();
