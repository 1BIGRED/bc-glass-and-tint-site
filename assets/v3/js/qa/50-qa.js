/* BC Glass & Tint v3, /qa search (page bundle "qa", front matter bundles in qa.njk). Moved out of
   the core 60-moments.js (peak pass R1, technical 7 and part A request 5): only /qa needs it, so the
   core bundle every page loads no longer carries it.
   Filters the rendered questions in place and opens the matches so the answer shows. Without JS the
   box never shows ([data-js-only]) and every question prints. */
(function () {
  "use strict";
  var doc = document;
  var qa = doc.querySelector("[data-qa-search]");
  if (!qa) return;
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
})();
