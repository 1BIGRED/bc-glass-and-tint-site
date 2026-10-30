// /book restates the build's price (peak pass R2 part A, psychology N4). Auto-registered plugin.
//
//   pricing | bookBuildPrices(mode)  -> { "<class letter><f><r><b><add-on letters>": { d, x } }
//
// One entry per build shape the builder can price, through the SAME gate and solver the builder's
// total uses (lib/pricing.js quoteFor, which is builder/00-price-core.js): the class letter (C car,
// S SUV, P pickup, V van), three 0/1 flags for front doors, rear doors, back glass (film or not; the
// shade never changes the price), then the add-on letters in code order (T top strip, R sunroof).
// An add-on letter is only listed when that add-on's own price passes the gate, and a shape is only
// listed when quoteFor shows a price for every picked piece, so a production build carries no draft
// number at all (in production today the object is empty). d = the words the builder shows
// ("From $350"), x = true when it is a draft (preview builds only). The "Also ask about" letters
// (W, H) never change a total and are ignored by the reader (assets/v3/js/book/40-request-build.js).
const P = require("./pricing");

const CLASS_LETTER = { car: "C", suv: "S", pickup: "P", van: "V" };
const WIN_KEYS = ["front-doors", "rear-doors", "back-glass"];

function bookBuildPrices(pricing, mode) {
  const out = {};
  const m = mode || "production";
  const classes = ((pricing && pricing.vehicle_classes) || []).map((c) => c.id).filter((id) => CLASS_LETTER[id]);
  const addonDefs = ((pricing && pricing.addons) || []).filter((a) => a.id === "top-strip" || a.id === "sunroof");
  classes.forEach((cl) => {
    const priced = {};
    addonDefs.forEach((a) => {
      const r = P.addonFor(pricing, a, cl, m);
      if (r.state === "priced") priced[a.id === "top-strip" ? "T" : "R"] = r.price_key;
    });
    const letterSets = [""];
    if (priced.T) letterSets.push("T");
    if (priced.R) letterSets.push("R");
    if (priced.T && priced.R) letterSets.push("TR");
    for (let bits = 0; bits < 8; bits++) {
      const flags = [bits & 4 ? 1 : 0, bits & 2 ? 1 : 0, bits & 1 ? 1 : 0];
      const winKeys = WIN_KEYS.filter((k, i) => flags[i] === 1);
      letterSets.forEach((ls) => {
        const keys = winKeys.concat(ls.split("").filter(Boolean).map((l) => priced[l]));
        if (!keys.length) return;
        const q = P.quoteFor(pricing, cl, keys, m);
        if (!q.show) return;
        out[CLASS_LETTER[cl] + flags.join("") + ls] = { d: q.display, x: q.draft === true };
      });
    }
  });
  return out;
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addFilter("bookBuildPrices", bookBuildPrices);
};
module.exports.bookBuildPrices = bookBuildPrices;
