// WS2 (header, status and the action system): Eleventy plugin, auto-registered by .eleventy.js
// (every lib/eleventy-*.js file). Adds one filter and one global.
//
//   bcHoursLine(site.hours)   -> { short: "Tue to Sat, 9 to 5", long: "Tuesday to Saturday, 9 to 5", ... }
//                                built from the same site.json hours the status function uses, so the
//                                printed line can never drift from the logic (assets/v3/js/00-status-core.js).
//   bcClockHook (global)      -> true on every build except Netlify CONTEXT=production. When true,
//                                v3/sticky-bar.njk prints data-test-clock on the call bar and
//                                30-actions.js honors window.BC_NOW and ?bcnow= (test hook only).
//                                A production build never carries the attribute.
const path = require("path");
const statusCore = require(path.join(__dirname, "..", "assets", "v3", "js", "00-status-core.js"));

module.exports = function (eleventyConfig) {
  eleventyConfig.addFilter("bcHoursLine", (hours) => statusCore.hoursLine({
    days: (hours && hours.days) || [],
    opens: hours && hours.opens,
    closes: hours && hours.closes
  }));
  eleventyConfig.addGlobalData("bcClockHook", process.env.CONTEXT !== "production");
};
