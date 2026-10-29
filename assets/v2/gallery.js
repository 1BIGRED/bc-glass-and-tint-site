/* BC Glass & Tint v2: gallery behavior (hub and filter pages). Everything here is optional.
   Without JavaScript every filter is a real link to a static page and every tile is a link to
   the full photo. With it:
   1. On the hub, the filter links filter in place and update the address bar to the real path
      (pushState, never a hash). On a filter page the links navigate normally.
   2. The search box (hidden until this script runs) narrows the photos on the page by make,
      model, body type and service. No results shows a friendly empty state with a call link.
   3. Tiles open a native <dialog> lightbox: Escape and the close button close it and focus
      returns to the tile; Left and Right arrows (and the two buttons) move between photos.
   Filtering and search get no animation. The dialog fades in with opacity only (CSS). */
(function () {
  "use strict";
  var root = document.querySelector("[data-tw]");
  if (!root) return;
  var grid = root.querySelector("[data-tw-grid]");
  if (!grid) return;
  var isHub = root.hasAttribute("data-tw-hub");
  var items = [].slice.call(grid.children);
  var search = root.querySelector("[data-tw-search]");
  var input = document.getElementById("tw-q");
  var clearBtn = root.querySelector("[data-tw-clear]");
  var status = root.querySelector("[data-tw-status]");
  var empty = root.querySelector("[data-tw-empty]");
  var h1 = root.querySelector("[data-tw-h1]");
  var lead = root.querySelector("[data-tw-lead]");
  var links = [].slice.call(root.querySelectorAll("[data-tw-view]"));
  var views = [];
  try { views = JSON.parse(document.getElementById("tw-views").textContent) || []; } catch (e) { views = []; }

  var viewKey = root.getAttribute("data-tw-key") || "all";
  var query = "";

  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function tokens(s) { return String(s || "").toLowerCase().split(/\s+/).map(norm).filter(Boolean); }
  function viewByKey(k) { for (var i = 0; i < views.length; i++) if (views[i].key === k) return views[i]; return null; }
  function viewByPath(p) {
    p = p.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
    for (var i = 0; i < views.length; i++) if (views[i].href === p) return views[i];
    return null;
  }
  function inView(li, v) {
    if (!v || v.kind === "all") return true;
    return v.kind === "svc" ? li.getAttribute("data-svc") === v.val : li.getAttribute("data-body") === v.val;
  }
  function visible() { return items.filter(function (li) { return !li.hidden; }); }

  var statusOne = status && status.getAttribute("data-one");
  var statusMany = status && status.getAttribute("data-many");
  var statusNone = status && status.getAttribute("data-zero");

  function render() {
    var v = isHub ? viewByKey(viewKey) : null;
    var toks = tokens(query);
    var n = 0;
    items.forEach(function (li) {
      var ok = inView(li, v);
      if (ok && toks.length) {
        var hay = norm(li.getAttribute("data-q"));
        for (var i = 0; i < toks.length; i++) if (hay.indexOf(toks[i]) === -1) { ok = false; break; }
      }
      li.hidden = !ok;
      if (ok) n++;
    });
    if (empty) empty.hidden = n !== 0;
    if (status) status.textContent = n === 0 ? statusNone : (n === 1 ? statusOne : statusMany.replace("{n}", n));
    if (clearBtn) clearBtn.hidden = !query;
    links.forEach(function (a) {
      if (a.getAttribute("data-tw-view") === viewKey) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function setPageText(v) {
    if (!v) return;
    if (h1) h1.textContent = v.h1;
    if (lead) lead.textContent = v.lead;
    if (v.title) document.title = v.title;
    var can = document.querySelector('link[rel="canonical"]');
    if (can) can.setAttribute("href", location.origin + v.href);
  }

  function setView(k, push) {
    var v = viewByKey(k);
    if (!v) return;
    viewKey = k;
    setPageText(v);
    if (push) { try { history.pushState({ twView: k }, "", v.href); } catch (e) { /* stay on the page */ } }
    render();
  }

  if (isHub && views.length) {
    root.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("[data-tw-view]") : null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var v = viewByKey(a.getAttribute("data-tw-view"));
      if (!v) return;
      e.preventDefault();
      setView(v.key, true);
    });
    window.addEventListener("popstate", function () {
      var v = viewByPath(location.pathname) || viewByKey("all");
      if (v) setView(v.key, false);
    });
  }

  if (search && input) {
    search.hidden = false;
    input.addEventListener("input", function () { query = input.value; render(); });
    if (clearBtn) clearBtn.addEventListener("click", function () { input.value = ""; query = ""; render(); input.focus(); });
  }

  /* ---------- Lightbox ---------- */
  var dlg = document.getElementById("tw-dialog");
  if (dlg && typeof dlg.showModal === "function") {
    var dImg = document.getElementById("tw-d-img");
    var dTitle = document.getElementById("tw-d-title");
    var dSub = document.getElementById("tw-d-sub");
    var dCount = document.getElementById("tw-d-count");
    var dAct = document.getElementById("tw-d-act");
    var actDefault = { label: dAct ? dAct.textContent : "", href: dAct ? dAct.getAttribute("href") : "" };
    var list = [];
    var idx = 0;
    var opener = null;

    function show(i) {
      if (!list.length) return;
      idx = (i + list.length) % list.length;
      var li = list[idx];
      dImg.removeAttribute("width");
      dImg.removeAttribute("height");
      dImg.setAttribute("width", li.getAttribute("data-w"));
      dImg.setAttribute("height", li.getAttribute("data-h"));
      dImg.alt = li.getAttribute("data-alt") || "";
      dImg.src = li.getAttribute("data-src");
      dTitle.textContent = li.getAttribute("data-title") || "";
      dSub.textContent = li.getAttribute("data-sub") || "";
      dCount.textContent = (dCount.getAttribute("data-tpl") || "{i} of {n}").replace("{i}", idx + 1).replace("{n}", list.length);
      var label = li.getAttribute("data-act-label"), href = li.getAttribute("data-act-href");
      if (dAct) {
        dAct.textContent = label || actDefault.label;
        dAct.setAttribute("href", href || actDefault.href);
      }
      var nxt = list[(idx + 1) % list.length];
      if (nxt && nxt !== li) { var pre = new Image(); pre.src = nxt.getAttribute("data-src"); }
    }

    grid.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest(".tw-open") : null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      opener = a;
      list = visible();
      var li = a.closest(".tw-item");
      show(Math.max(0, list.indexOf(li)));
      document.documentElement.classList.add("tw-lock");
      dlg.showModal();
    });

    dlg.addEventListener("click", function (e) {
      var t = e.target;
      if (t === dlg || (t.classList && t.classList.contains("tw-box__in"))) { dlg.close(); return; }
      if (t.closest && t.closest("[data-tw-close]")) dlg.close();
      else if (t.closest && t.closest("[data-tw-prev]")) show(idx - 1);
      else if (t.closest && t.closest("[data-tw-next]")) show(idx + 1);
    });

    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(idx - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); show(idx + 1); }
    });

    dlg.addEventListener("close", function () {
      document.documentElement.classList.remove("tw-lock");
      if (opener && document.contains(opener)) opener.focus();
    });
  }

  render();
})();
