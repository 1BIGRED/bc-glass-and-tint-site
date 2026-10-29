// Data for prices.html, the full price guide. Wording: _data/pages/prices.json. Every number comes
// from _data/pricing.json through lib/pricing.js (priceFor / quoteFor) with this build's price
// mode; nothing is typed in a template. full_windshield_film (legal_hold) is never read here.
//
//   pr_cards    the three "From" cards: { gate result, parts for the big numeral, note }
//   pr_auto     auto tint table: coverage rows x vehicle classes (quoteFor), plus the add-on lines
//   pr_rows     the service tables, row by row (priceFor)
//   pr_faq      the visible FAQ, answer chosen by the template_note rule; the FAQPage schema is
//               built from this SAME list, so the page and the structured data cannot differ
//   schema_ld   Breadcrumb, the one business node (#business), a Service with Offers ONLY for
//               prices the public site shows (production gate, never a draft), FAQPage, WebSite,
//               WebPage
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const { priceFor, quoteFor, priceMode } = require("./lib/pricing");

const MODE = priceMode(process.env);

function at(obj, path) {
  return String(path || "").split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

// "From $350" -> { from: true, cur: "$", num: "350" }; "$80" -> { from: false, ... }. Anything
// else ("Starting at $15 per square foot") keeps its whole display string.
function splitDisplay(display) {
  const m = /^(from\s+)?\$([\d,]+)(.*)$/i.exec(String(display || "").trim());
  if (!m || (m[3] || "").trim()) return { whole: String(display || "") };
  return { from: !!m[1], cur: "$", num: m[2] };
}

function gated(entry) {
  if (!entry || entry.legal_hold === true) return { show: false, display: "", draft: false };
  return priceFor(entry, MODE);
}

function faqItems(data) {
  const pg = data.pages.prices;
  const sv = (data.pricing && data.pricing.services) || {};
  return pg.faq.items.map((it) => {
    let answer = it.answer;
    if (it.answer_when_published) {
      // Published wording only when BOTH chip prices pass the PRODUCTION gate (confirmed + publish).
      const a = priceFor(sv.chip_repair_first, "production");
      const b = priceFor(sv.chip_repair_additional, "production");
      if (a.show && b.show) {
        answer = it.answer_when_published
          .replace("{chip_repair_first}", sv.chip_repair_first.display)
          .replace("{chip_repair_additional}", sv.chip_repair_additional.display);
      }
    }
    return { question: it.question, answer };
  });
}

module.exports = {
  eleventyComputed: {
    pr_cards: (data) => {
      const c = data.pages.prices.cards;
      return (c.items || []).map((it) => {
        const p = gated(at(data.pricing, it.price));
        const np = it.note_price ? gated(at(data.pricing, it.note_price)) : null;
        let note = "";
        if (p.show) {
          if (np && np.show && it.note) note = it.note.replace("{price}", np.display);
          else if (it.note_alone) note = it.note_alone;
        }
        return Object.assign({}, it, { p, parts: p.show ? splitDisplay(p.display) : null, note, note_draft: !!(np && np.show && np.draft) });
      });
    },
    pr_auto: (data) => {
      const pr = data.pricing || {};
      const a = pr.auto_tint || {};
      const sec = data.pages.prices.sections.auto_tint;
      const byId = {};
      (pr.vehicle_classes || []).forEach((c) => { byId[c.id] = c; });
      const classes = (sec.class_order || []).map((id) => byId[id]).filter(Boolean);
      const rows = (sec.row_order || []).filter((k) => a.coverage && a.coverage[k]).map((k) => ({
        label: a.coverage[k].label,
        cells: classes.map((c) => quoteFor(pr, c.id, a.coverage[k].panels, MODE))
      }));
      const lines = (sec.line_rows || []).filter((k) => a.panels && a.panels[k]).map((k) => ({
        label: a.panels[k].label,
        cells: classes.map((c) => gated(a.panels[k][c.id]))
      }));
      return { classes, rows, lines };
    },
    pr_rows: (data) => {
      const pg = data.pages.prices;
      const sv = (data.pricing && data.pricing.services) || {};
      const out = {};
      Object.keys(pg.sections).forEach((key) => {
        const rows = pg.sections[key].rows;
        if (!rows) return;
        out[key] = rows.filter((k) => sv[k]).map((k) => ({
          key: k,
          label: (pg.row_labels && pg.row_labels[k]) || sv[k].label,
          price: gated(sv[k])
        }));
      });
      return out;
    },
    pr_faq: (data) => faqItems(data),
    // true when at least one price on the page shows in this mode (picks the hero intro line)
    pr_any: (data) => {
      const pr = data.pricing || {};
      const a = pr.auto_tint || {};
      const groups = [a.coverage || {}, a.panels || {}];
      const auto = groups.some((g) => Object.keys(g).some((k) => Object.keys(g[k]).some((c) => gated(g[k][c]).show)));
      const svc = Object.keys(pr.services || {}).some((k) => gated(pr.services[k]).show);
      return auto || svc;
    },
    schema_ld: (data) => {
      const pg = data.pages.prices;
      const pr = data.pricing || {};
      const url = S.pageUrl(data.slug);
      // Offers only for prices the PUBLIC site shows (status confirmed AND publish true).
      const offers = [];
      function offer(name, entry) {
        const r = priceFor(entry, "production");
        if (!r.show || r.draft) return;
        const o = { "@type": "Offer", name, priceCurrency: pr.currency || "USD", url };
        if (/^from\b/i.test(String(entry.display || ""))) {
          o.priceSpecification = { "@type": "PriceSpecification", minPrice: entry.amount, priceCurrency: pr.currency || "USD" };
        } else {
          o.price = entry.amount;
        }
        offers.push(o);
      }
      const a = pr.auto_tint || {};
      (pr.vehicle_classes || []).forEach((c) => {
        Object.keys(a.coverage || {}).forEach((k) => offer(a.coverage[k].label + ", " + c.plural, a.coverage[k][c.id]));
        Object.keys(a.panels || {}).forEach((k) => offer(a.panels[k].label + ", " + c.plural, a.panels[k][c.id]));
      });
      Object.keys(pr.services || {}).forEach((k) => offer(pr.services[k].label, pr.services[k]));
      const service = offers.length ? {
        "@type": "Service",
        "@id": url + "#service",
        name: pg.schema.service_name,
        url,
        provider: { "@id": S.BUSINESS_ID },
        offers
      } : null;
      return S.graph([
        S.breadcrumbNode({ slug: data.slug, name: S.plain(fill(pg.hero.crumb)) }),
        S.businessNode(data.site),
        service,
        S.faqPageNode(faqItems(data), { slug: data.slug }),
        S.websiteNode(data.site),
        S.webpageNode({ slug: data.slug, name: S.plain(fill(pg.meta.title)), dateModified: pg.schema.date_modified })
      ]);
    }
  }
};
