/* BC Glass & Tint v3, build code (WS4; engineering 3.2.5). UMD, the ONE copy shared by the build
   (lib/buildcode.js re-exports this file), the builder, the gallery "Build this look" links and
   /book (WS3). In Node it is module.exports, in the browser window.BCBuild.

   Format:  BC-<class><front><rear>[<back>][F<windshield>]<letters>
     class    C car, S SUV, P pickup, V van
     shades   two characters each: "00" no film, "05" to "99" the shade number (percent of light
              through), "xx" film on that window with the shade not picked yet (a preset whose shade
              the owner has not named). <back> is left out when it equals <rear>, so
              "BC-S3520T" reads: SUV, front doors 35, rear doors and back glass 20, top strip.
     F<ws>    the full windshield (Chase 2026-10-31), two characters as above, left out when it has
              no film: "BC-C3535F70" is a car with 35 all round and 70 on the full windshield. A
              filmed full windshield covers the top strip, so a code never carries both (normalize
              drops T, and a code with both does not decode: one spelling per build).
     letters  T windshield top strip, R sunroof, W ask about windshield ceramic coating,
              H ask about headlight restoration; each at most once, written in that order.
   The code carries no personal data, reads aloud, and survives a URL unescaped.

   Nevada line (NRS 484D.440): front doors at least 35 percent for driving. Chase ruled 2026-10-31
   that the builder offers every shade on the front doors (medical exemption or show use), so a
   darker front shade encodes and decodes; summary() then adds the plain line LABELS.front_dark.
   A filmed full windshield adds LABELS.windshield_dark the same way (a picked shade, not "xx").
   FRONT_MIN stays as that line (used for the note, never as a block).

   Old v2 codes ("BC-C-35-15-15-0" or "C-35-15-15-0": front, rear, back, strip) still decode.

   Build object:  { v: "car"|"suv"|"pickup"|"van", front, rear, back, windshield, addons: [ids] }
     front, rear, back, windshield: 0 (no film), an integer 5 to 99, or "x" (film, shade not picked)
     addons: any of "top-strip", "sunroof", "ws-coating", "headlights", in that order */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BCBuild = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FRONT_MIN = 35;
  var MIN_SHADE = 5;
  var CLASSES = { car: "C", suv: "S", pickup: "P", van: "V" };
  var CLASS_BY_LETTER = { C: "car", S: "suv", P: "pickup", V: "van" };
  var ADDONS = [
    { id: "top-strip", letter: "T" },
    { id: "sunroof", letter: "R" },
    { id: "ws-coating", letter: "W" },
    { id: "headlights", letter: "H" }
  ];
  var ADDON_BY_LETTER = {};
  ADDONS.forEach(function (a) { ADDON_BY_LETTER[a.letter] = a.id; });
  var PANELS = ["front", "rear", "back", "windshield"];

  // Words used when a shade number is not confirmed by the owner (CEO ruling 2026-10-29: show
  // percentage numbers only for shades pricing.json marks confirmed). Keyed by the example shades.
  var WORDS = { 70: "lightest shade", 50: "light shade", 45: "light to medium shade", 35: "medium shade", 20: "dark shade", 15: "darker shade", 5: "darkest shade" };

  var LABELS = {
    classes: { car: "Car", suv: "SUV", pickup: "Pickup", van: "Van" },
    front: "Front doors",
    rear: "Rear doors",
    back: "Back glass",
    windshield: "Full windshield",
    front_dark: "Darker than Nevada allows on front doors for driving (35 percent, NRS 484D.440). For a medical exemption or show use.",
    // every full windshield shade carries this note (Chase 2026-10-31; peak 10-31 W3); the top strip never does
    windshield_dark: "Darker than Nevada allows on the windshield for driving (film only as a strip across the very top, NRS 484D.440). For a medical exemption or show use.",
    rear_back: "Rear doors and back glass",
    unset: "shade to pick",
    picked: "shade picked",
    nothing: "No windows picked yet.",
    addons: { "top-strip": "Windshield top strip", sunroof: "Sunroof" },
    ask_intro: "Also ask about",
    ask: { "ws-coating": "windshield ceramic coating", headlights: "headlight restoration" }
  };

  function validShade(s) {
    if (s === 0 || s === "x") return true;
    if (typeof s !== "number" || !isFinite(s) || Math.floor(s) !== s) return false;
    return s >= MIN_SHADE && s <= 99;
  }

  // A clean copy of a build, or null when anything is out of bounds.
  function normalize(b) {
    if (!b || typeof b !== "object" || !CLASSES[b.v]) return null;
    var out = { v: b.v };
    for (var i = 0; i < PANELS.length; i++) {
      var p = PANELS[i];
      var s = b[p] == null ? 0 : b[p];
      if (typeof s === "string" && s !== "x" && /^\d+$/.test(s)) s = parseInt(s, 10);
      if (!validShade(s)) return null;
      out[p] = s;
    }
    var list = Array.isArray(b.addons) ? b.addons : [];
    var seen = {};
    for (var j = 0; j < list.length; j++) {
      var known = ADDONS.some(function (a) { return a.id === list[j]; });
      if (!known || seen[list[j]]) return null;
      seen[list[j]] = true;
    }
    // a filmed full windshield covers the top strip: the strip is dropped, never priced twice
    if (out.windshield !== 0) seen["top-strip"] = false;
    out.addons = ADDONS.filter(function (a) { return seen[a.id]; }).map(function (a) { return a.id; });
    return out;
  }

  function token(s) {
    if (s === "x") return "xx";
    return (s < 10 ? "0" : "") + String(s);
  }

  // encode(build) -> "BC-..." or null
  function encode(b) {
    var n = normalize(b);
    if (!n) return null;
    var code = "BC-" + CLASSES[n.v] + token(n.front) + token(n.rear);
    if (n.back !== n.rear) code += token(n.back);
    if (n.windshield !== 0) code += "F" + token(n.windshield);
    ADDONS.forEach(function (a) { if (n.addons.indexOf(a.id) > -1) code += a.letter; });
    return code;
  }

  function readToken(t) {
    if (t === "XX") return "x";
    var v = parseInt(t, 10);
    return v;
  }

  // decode(code) -> build or null (anything malformed, illegal or too long gives null)
  function decode(code) {
    if (typeof code !== "string") return null;
    var c = code.trim();
    if (!c || c.length > 24) return null;
    c = c.toUpperCase();
    var m = /^BC-([CSPV])((?:\d\d|XX){2,3})(?:F(\d\d|XX))?([TRWH]{0,4})$/.exec(c);
    var b;
    if (m) {
      var toks = m[2].match(/.{2}/g);
      var front = readToken(toks[0]);
      var rear = readToken(toks[1]);
      var back = toks.length === 3 ? readToken(toks[2]) : rear;
      // A 3-token code whose back equals its rear is not canonical; refuse it so every code has
      // exactly one spelling.
      if (toks.length === 3 && toks[1] === toks[2]) return null;
      // "F00", and a filmed windshield together with T, are not canonical either
      if (m[3] === "00") return null;
      var ws = m[3] ? readToken(m[3]) : 0;
      var letters = m[4].split("");
      if (ws !== 0 && letters.indexOf("T") > -1) return null;
      var ids = letters.map(function (l) { return ADDON_BY_LETTER[l]; });
      b = { v: CLASS_BY_LETTER[m[1]], front: front, rear: rear, back: back, windshield: ws, addons: ids };
    } else {
      var old = /^(?:BC-)?([CSPV])-(\d{1,2})-(\d{1,2})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(c);
      if (!old) return null;
      b = {
        v: CLASS_BY_LETTER[old[1]],
        front: parseInt(old[2], 10),
        rear: parseInt(old[3], 10),
        back: parseInt(old[4], 10),
        addons: old[5] && parseInt(old[5], 10) > 0 ? ["top-strip"] : []
      };
    }
    return normalize(b);
  }

  function isValid(code) {
    return decode(code) !== null;
  }

  // summary(buildOrCode, opts) -> one plain line, e.g.
  //   "SUV. Front doors, medium shade. Rear doors and back glass, dark shade. Windshield top strip."
  // opts.confirmed: shade numbers the owner confirmed (pricing.json shades_installed); only these
  //   print as numbers ("35 percent"). opts.words: { 35: "..." } overrides WORDS.
  // opts.labels: overrides LABELS (merged one level deep).
  function summary(input, opts) {
    var b = typeof input === "string" ? decode(input) : normalize(input);
    if (!b) return "";
    var o = opts || {};
    var L = {};
    Object.keys(LABELS).forEach(function (k) { L[k] = LABELS[k]; });
    if (o.labels) Object.keys(o.labels).forEach(function (k) {
      L[k] = (typeof LABELS[k] === "object" && typeof o.labels[k] === "object")
        ? Object.assign({}, LABELS[k], o.labels[k]) : o.labels[k];
    });
    var confirmed = (o.confirmed || []).map(Number);
    var words = Object.assign({}, WORDS, o.words || {});
    function shadeText(s) {
      if (s === "x") return L.unset;
      if (confirmed.indexOf(s) > -1) return s + " percent";
      return words[s] || L.picked;
    }
    var out = [L.classes[b.v] + "."];
    var any = false;
    if (b.front) {
      out.push(L.front + ", " + shadeText(b.front) + ".");
      if (typeof b.front === "number" && b.front < FRONT_MIN && L.front_dark) out.push(L.front_dark);
      any = true;
    }
    if (b.rear && b.back && b.rear === b.back) {
      out.push(L.rear_back + ", " + shadeText(b.rear) + "."); any = true;
    } else {
      if (b.rear) { out.push(L.rear + ", " + shadeText(b.rear) + "."); any = true; }
      if (b.back) { out.push(L.back + ", " + shadeText(b.back) + "."); any = true; }
    }
    if (b.windshield) {
      out.push(L.windshield + ", " + shadeText(b.windshield) + ".");
      if (typeof b.windshield === "number" && L.windshield_dark) out.push(L.windshield_dark);
      any = true;
    }
    b.addons.forEach(function (id) {
      if (L.addons[id]) { out.push(L.addons[id] + "."); any = true; }
    });
    var asks = b.addons.filter(function (id) { return L.ask[id]; }).map(function (id) { return L.ask[id]; });
    if (asks.length) out.push(L.ask_intro + " " + asks.join(" and ") + ".");
    if (!any) out.push(L.nothing);
    return out.join(" ");
  }

  return {
    FRONT_MIN: FRONT_MIN,
    MIN_SHADE: MIN_SHADE,
    CLASSES: CLASSES,
    ADDONS: ADDONS,
    PANELS: PANELS,
    WORDS: WORDS,
    LABELS: LABELS,
    normalize: normalize,
    encode: encode,
    decode: decode,
    isValid: isValid,
    summary: summary
  };
});
