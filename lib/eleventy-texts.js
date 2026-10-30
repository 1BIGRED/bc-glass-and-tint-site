// Texting gate for hand-written copy (peak pass R1, 2026-10-30; CEO ruling "TEXTING").
//
// Whether a text to (702) 550-8840 reaches anyone is not confirmed (_data/site.json
// texts_confirmed: false; R1-psychology item 1: the line may be a landline). The booking controls
// (sms: links) are gated in the action macro (fixes A). This plugin gates the WORDS: while
// texts_confirmed is not true, every page's HTML (visible text, meta description and the FAQPage
// JSON-LD alike, so the two never disagree) has its "call or text" invitations rewritten to the
// call-only form below. The data files keep the full wording, so flipping texts_confirmed to true
// in the CMS brings every "text" invitation back with no copy edit.
//
// Not rewritten, on purpose:
//   /privacy-policy        approved C-028 legal text; it describes what the consent covers
//   /book, /book/sent,     fixes A pages: they gate their own copy
//   /build-your-tint
// The phrase list is explicit (no pattern guessing); a phrase not on it is left alone, and
// lib/validate.js scans a production build for any "text us" invitation left over.
"use strict";

const fs = require("fs");
const path = require("path");

// Matched against the output file name (pages are written as /<slug>.html, /book/sent/index.html).
const SKIP = [/(^|[\\/])privacy-policy\.html$/, /(^|[\\/])book\.html$/, /(^|[\\/])book[\\/]sent[\\/]index\.html$/, /(^|[\\/])build-your-tint\.html$/];

// [from, to], longest first. Case is matched exactly (each phrase is listed as it is written).
const PHRASES = [
  ["You call, text or request a time.", "You call or request a time."],
  ["Call, text, or request a time.", "Call or request a time."],
  ["Call, text or request a time", "Call or request a time"],
  ["Call or text us and we will", "Call us and we will"],
  ["Call or text us now.", "Call us now."],
  ["Call or text us", "Call us"],
  ["call or text us", "call us"],
  ["Call or text (702) 550-8840", "Call (702) 550-8840"],
  ["Call or text", "Call"],
  ["call or text", "call"]
];

function textsConfirmed() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "_data", "site.json"), "utf8");
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).texts_confirmed === true;
  } catch (e) {
    return false;
  }
}

function gate(html) {
  let out = html;
  PHRASES.forEach(([from, to]) => {
    out = out.split(from).join(to);
  });
  return out;
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addTransform("textsGate", function (content) {
    const out = (this.page && this.page.outputPath) || "";
    if (!/\.html$/.test(out) || typeof content !== "string") return content;
    if (textsConfirmed()) return content;
    if (SKIP.some((re) => re.test(out))) return content;
    return gate(content);
  });
};
module.exports.PHRASES = PHRASES;
module.exports.gate = gate;
