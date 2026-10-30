// WS3 (request path, tracking and consent) Eleventy plugin. Auto-registered by .eleventy.js, which
// loads every lib/eleventy-*.js and calls it as a plugin.
//
// rqFill: wording in _data/pages/book.json carries tokens instead of typed facts, so the phone
// number and the hours always come from _data/site.json (one source). Tokens:
//   {phone}       site.phone.display_call, for example (702) 550-8840
//   {phone_link}  the same number as a tap-to-call link, for a sentence that says "call"
//   {hours}       site.hours.display, for example Tuesday to Saturday, 9am to 5pm
// Usage:  {{ pages.book.form.send_error | rqFill(site) | safe }}
// Unknown tokens are left as they are so a typo is visible, never silently blank.
module.exports = function (eleventyConfig) {
  eleventyConfig.addFilter("rqFill", function (value, site) {
    if (value == null) return "";
    const s = site || {};
    const phone = s.phone && s.phone.display_call ? s.phone.display_call : "{phone}";
    const tel = s.phone && s.phone.tel ? s.phone.tel : "";
    const phoneLink = tel ? '<a class="tnum" href="tel:' + tel + '">' + phone + "</a>" : phone;
    const hours = s.hours && s.hours.display ? s.hours.display : "{hours}";
    return String(value)
      .replace(/\{phone_link\}/g, phoneLink)
      .replace(/\{phone\}/g, phone)
      .replace(/\{hours\}/g, hours);
  });
};
