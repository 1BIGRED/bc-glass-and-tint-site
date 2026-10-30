// Build context for BC Glass & Tint (overhaul v3, WS1 Platform).
//
// One place decides what kind of build this is, so robots, analytics, the _headers file, the
// claims guard and the /v3-smoke/ page all agree.
//
//   production   Netlify CONTEXT === "production" AND BC_NOINDEX is not "1". The only build
//                that is indexable, sends analytics, and FAILS on a banned claim.
//   noindex      BC_NOINDEX === "1" (the staging site) OR a Netlify CONTEXT that is set and is not
//                "production" (deploy-preview, branch-deploy, dev). Such a build prints
//                "noindex, nofollow", stubs analytics, and writes _headers with X-Robots-Tag.
//   analytics    true only in a production build. A local build (no CONTEXT) is indexable by the
//                robots rule (engineering 3.6) but sends no analytics, so a local QA server never
//                fires a real GA4 event.
//   local        CONTEXT is unset (npx @11ty/eleventy on a workstation). Guards warn, they do not fail.

"use strict";

function resolve(env) {
  const e = env || process.env;
  const raw = String(e.CONTEXT || "").trim();
  const bcNoindex = String(e.BC_NOINDEX || "") === "1";
  const nonProduction = raw !== "" && raw !== "production";
  const noindex = bcNoindex || nonProduction;
  const production = raw === "production" && !bcNoindex;
  const reasons = [];
  if (bcNoindex) reasons.push("BC_NOINDEX=1");
  if (nonProduction) reasons.push("CONTEXT=" + raw);
  return {
    context: raw || "local",
    local: raw === "",
    production: production,
    noindex: noindex,
    analytics: production,
    reasons: reasons
  };
}

// Today in the shop's time zone as YYYY-MM-DD. BC_TODAY=YYYY-MM-DD overrides it so a guard or a
// closure window can be tested on a fixed day.
function today(env, timeZone) {
  const e = env || process.env;
  const forced = String(e.BC_TODAY || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(forced)) return forced;
  const tz = timeZone || "America/Los_Angeles";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

module.exports = { resolve, today };
