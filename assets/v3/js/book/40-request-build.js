/* BC Glass & Tint v3, the build pre-fill of the request form, /book only (the "book" page bundle,
   /assets/h/book.<hash>.js, loaded by front matter bundles: ["book"]). Moved out of the core bundle
   (assets/v3/js/40-request.js) in peak pass R1; the behavior is unchanged.

   Registers window.bcRequestBuild(form, ctx), which 40-request.js calls for every request form at
   setup (DOMContentLoaded, after this deferred bundle has run), and window.bcRequest.decodeBuild
   (the test hook tests/request.test.html reads on /book).
     ctx = { st, query, setField, details, service, buildNote }; st.buildText is what the success
     panel restates and what the lead event's has_build reads.

   Build code. One source of truth is WS4's UMD file (assets/v3/js/builder/10-buildcode.js,
   window.BCBuild). It lives in the page-only "builder" bundle, so on /book it is normally NOT
   loaded; when it is, this file uses it. Otherwise the small decoder below reads the same
   documented format and words, so the details box says the same thing either way.
   Format: BC-<class letter><two or three shade tokens><add-on letters>. Class C Car, S SUV, P Pickup,
   V Van. Tokens are two characters: "00" no film, "05" to "99" the shade, "xx" film with the shade
   not picked. Two tokens = front doors, then rear doors and back glass together (BC-S3520T); three =
   front, rear, back. Letters T top strip, R sunroof, W ask about windshield ceramic coating, H ask
   about headlight restoration. A front shade below 35 is not a legal build and is not a code.
   Shade words, not percentages, in the summary: the numbers print only for shades the owner has
   confirmed, which this page cannot know. The raw code stays in the details box and in
   build_code, so the shop still reads the exact numbers. */
(function () {
  "use strict";
  var CLASSES = { C: "Car", S: "SUV", P: "Pickup", V: "Van" };
  var SHADE_WORDS = { 70: "lightest shade", 50: "light shade", 35: "medium shade", 20: "dark shade", 15: "darker shade", 5: "darkest shade" };
  var ADDON_WORDS = { T: "Windshield top strip", R: "Sunroof" };
  var ASK_WORDS = { W: "windshield ceramic coating", H: "headlight restoration" };

  function shadeText(tok) {
    if (tok === "XX") return "shade to pick";
    return SHADE_WORDS[parseInt(tok, 10)] || "shade picked";
  }

  /* Returns null when raw is not a build code, else { code, summary } (summary null when the code
     has the shape of one but not a format decoded here). */
  function decodeBuild(raw) {
    if (typeof raw !== "string") return null;
    var code = raw.replace(/^\s+|\s+$/g, "");
    if (!/^BC-[A-Za-z0-9-]{3,22}$/i.test(code)) return null;
    var lib = window.BCBuild;
    if (lib && typeof lib.decode === "function" && typeof lib.summary === "function") {
      var b = lib.decode(code);
      return b ? { code: code, summary: lib.summary(b) || null } : null;
    }
    var m = /^BC-([CSPV])((?:\d\d|xx){2,3})([TRWH]{0,4})$/i.exec(code);
    /* the older v2 shape (BC-C-35-15-15-0: class, front, rear, back, strip) is a real code but is not
       decoded here; anything else that is not the documented format is not a code */
    if (!m) return /^BC-[CSPV]-\d{1,2}-\d{1,2}-\d{1,2}(?:-\d{1,2})?$/i.test(code) ? { code: code, summary: null } : null;
    var toks = m[2].toUpperCase().match(/\d\d|XX/g), i, n;
    for (i = 0; i < toks.length; i++) {
      if (toks[i] === "XX" || toks[i] === "00") continue;
      n = parseInt(toks[i], 10);
      if (n < 5 || (i === 0 && n < 35)) return null;
    }
    var out = [CLASSES[m[1].toUpperCase()] + "."];
    if (toks[0] !== "00") out.push("Front doors, " + shadeText(toks[0]) + ".");
    if (toks.length === 2 || toks[1] === toks[2]) {
      if (toks[1] !== "00") out.push("Rear doors and back glass, " + shadeText(toks[1]) + ".");
    } else {
      if (toks[1] !== "00") out.push("Rear doors, " + shadeText(toks[1]) + ".");
      if (toks[2] !== "00") out.push("Back glass, " + shadeText(toks[2]) + ".");
    }
    var letters = m[3].toUpperCase(), asks = [];
    for (i = 0; i < letters.length; i++) {
      if (ADDON_WORDS[letters.charAt(i)]) out.push(ADDON_WORDS[letters.charAt(i)] + ".");
      else if (ASK_WORDS[letters.charAt(i)]) asks.push(ASK_WORDS[letters.charAt(i)]);
    }
    if (asks.length) out.push("Also ask about " + asks.join(" and ") + ".");
    return { code: code, summary: out.join(" ") };
  }

  function prefill(form, ctx) {
    var st = ctx.st, detailsEl = ctx.details, svcEl = ctx.service, q = ctx.query;
    var savedBox = form.querySelector("[data-rq-saved]");
    var savedGone = form.querySelector("[data-rq-saved-gone]");
    var vehLabel = savedGone ? savedGone.getAttribute("data-vehicle-label") || "" : "";
    /* The optional year, make and model the visitor typed on Build Your Tint (sessionStorage, never
       a URL). The builder promises it goes with the request, so it rides in the details text. */
    var model = "";
    try { model = String(window.sessionStorage.getItem("bc_build_model_v1") || ""); } catch (eM) { model = ""; }
    model = model.replace(/[\u0000-\u001f<>]/g, "").replace(/^\s+|\s+$/g, "").slice(0, 60);
    function buildDetails(b) {
      return "Build " + b.code + (b.summary ? ". " + b.summary : "") + (model && vehLabel ? " " + vehLabel + ": " + model + "." : "");
    }
    function applyBuildCode(b) {
      ctx.setField(form, "build_code", b.code);
      st.buildText = b.summary ? b.code + ". " + b.summary : b.code;
      var text = buildDetails(b);
      if (detailsEl && !detailsEl.value) detailsEl.value = text;
      return text;
    }
    var gotBuild = false;
    if (q) {
      var b = decodeBuild(q.get("b"));
      if (b) {
        applyBuildCode(b);
        gotBuild = true;
        if (ctx.buildNote) ctx.buildNote.hidden = false;
      }
    }

    /* No ?b= in the link: the build this browser saved on Build Your Tint (localStorage
       bc_build_v1, the code only) fills in, shown in plain words with a button that takes it out
       of this request. A vehicle with no window or add-on is not a build. Removing it is
       remembered for this tab (sessionStorage), and the saved build itself stays on the builder. */
    var SKIP = "bc_build_skip_v1";
    var onBookPage = !!(form.elements.source && form.elements.source.value === "book");
    if (gotBuild || !savedBox || !onBookPage) return;
    var saved = null, skip = null;
    try { saved = window.localStorage.getItem("bc_build_v1"); } catch (eS) { saved = null; }
    try { skip = window.sessionStorage.getItem(SKIP); } catch (eK) { skip = null; }
    var sb = saved && saved !== skip && !/^BC-[CSPV](?:00){2,3}$/i.test(saved) ? decodeBuild(saved) : null;
    if (!sb) return;
    var filled = applyBuildCode(sb);
    if (svcEl && !svcEl.value) {
      for (var si = 0; si < svcEl.options.length; si++) {
        if (svcEl.options[si].getAttribute("data-key") === "car") { svcEl.selectedIndex = si; break; }
      }
    }
    var tx = savedBox.querySelector("[data-rq-saved-text]");
    if (tx) tx.textContent = (tx.getAttribute("data-tpl") || "").replace("{code}", sb.code);
    savedBox.hidden = false;
    var rm = savedBox.querySelector("[data-rq-saved-remove]");
    if (rm) rm.addEventListener("click", function () {
      var bc = form.querySelector('[name="build_code"]');
      if (bc) bc.value = "";
      st.buildText = "";
      if (detailsEl && detailsEl.value === filled) detailsEl.value = "";
      try { window.sessionStorage.setItem(SKIP, sb.code); } catch (eW) { /* storage blocked */ }
      savedBox.hidden = true;
      if (savedGone) savedGone.hidden = false;
      if (detailsEl) { try { detailsEl.focus({ preventScroll: true }); } catch (eF) { detailsEl.focus(); } }
    });
  }

  window.bcRequestBuild = prefill;
  window.bcRequest = window.bcRequest || {};
  window.bcRequest.decodeBuild = decodeBuild;
})();
