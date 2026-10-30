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

  // 5. Q&A search ([data-qa-search], /qa only): filters the rendered questions in place; open the
  //    matches so the answer shows. Without JS the box stays hidden and every question prints.
  var qa = doc.querySelector("[data-qa-search]");
  if (qa) {
    var qin = qa.querySelector("input");
    var qcount = qa.querySelector("[data-qa-count]");
    var qempty = qa.querySelector("[data-qa-empty]");
    var qitems = Array.prototype.slice.call(doc.querySelectorAll("[data-qa-item]"));
    var qgroups = Array.prototype.slice.call(doc.querySelectorAll("[data-qa-group]"));
    qa.hidden = false;
    qin.addEventListener("input", function () {
      var terms = qin.value.toLowerCase().split(/\s+/).filter(Boolean);
      var shown = 0;
      qitems.forEach(function (it) {
        var txt = it.textContent.toLowerCase();
        var ok = terms.every(function (w) { return txt.indexOf(w) > -1; });
        it.hidden = !ok;
        it.open = !!(ok && terms.length);
        if (ok) shown++;
      });
      qgroups.forEach(function (g) { g.hidden = !g.querySelector("[data-qa-item]:not([hidden])"); });
      if (qcount) qcount.textContent = terms.length ? qcount.getAttribute("data-tpl").replace("{shown}", shown).replace("{total}", qcount.getAttribute("data-total")) : "";
      if (qempty) qempty.hidden = shown !== 0;
    });
  }

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
    var horizon = now.getTime() + 21 * 86400000;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var facts = [];
    list.forEach(function (c) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c && c.date ? c.date : "");
      if (!m) return;
      var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
      var end = d.getTime() + 12 * 3600000;
      if (end < now.getTime() || d.getTime() > horizon) return;
      facts.push({ d: d, reason: c.reason || "" });
    });
    if (facts.length) {
      Array.prototype.forEach.call(slots, function (slot) {
        var tpl = slot.getAttribute("data-fact") || "Closed {reason}, {date}.";
        var txt = facts.map(function (f) {
          var label = days[f.d.getUTCDay()] + " " + months[f.d.getUTCMonth()] + " " + f.d.getUTCDate();
          var reason = f.reason ? (/^the /i.test(f.reason) ? f.reason : "for " + f.reason) : "";
          return tpl.replace("{reason}", reason).replace("{date}", label).replace("  ", " ");
        }).join(" ");
        slot.textContent = (slot.getAttribute("data-intro") ? slot.getAttribute("data-intro") + " " : "") + txt;
        slot.hidden = false;
      });
    }
  }
})();
