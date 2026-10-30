// Data for /prices, v3 (WS4; blueprint 4.3 and 6.1, art direction 3.4, engineering 4.3 "prices page").
// Wording: _data/pages/prices.json. Every number comes from _data/pricing.json through lib/pricing.js
// with this build's price mode; nothing is typed in a template. full_windshield_film (legal_hold) is
// never read here.
//
//   pr_car      the car tint table: rows and lines x vehicle classes, each cell a gated priceParts
//               result; any_shown says whether one cell shows (else the page prints one honest list
//               of fallback rows instead of a grid of identical words); fvp: the fronts-plus-rears
//               arithmetic per class, only where all three prices pass AND sum
//   pr_home     home, office and blinds rows (gated, fallback words by row)
//   pr_ws       windshield chip rows (gated) plus the fixed text rows
//   pr_any      true when at least one price on the page shows in this mode (picks the lede)
//   pr_reviewed "Prices reviewed <date>" only when pricing.reviewed_on is a real date
//   pr_faq      the visible FAQ; the FAQPage JSON-LD is built from this SAME list
//   schema_ld   Breadcrumb, the one business node (#business), a Service with Offers ONLY for prices
//               the public site shows (production gate, never a draft), FAQPage, WebSite, WebPage
const S = require("./lib/schema");
const { fill } = require("./lib/filters");
const P = require("./lib/pricing");
const { priceParts } = require("./lib/eleventy-ws4");

const MODE = P.priceMode(process.env);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function faqItems(data) {
  const pg = data.pages.prices;
  const sv = (data.pricing && data.pricing.services) || {};
  return pg.faq.items.map((it) => {
    let answer = it.answer;
    if (it.answer_when_published) {
      // Published wording only when BOTH chip prices pass the PRODUCTION gate (confirmed + publish).
      const a = P.priceFor(sv.chip_repair_first, "production");
      const b = P.priceFor(sv.chip_repair_additional, "production");
      if (a.show && b.show) {
        answer = it.answer_when_published
          .replace("{chip_repair_first}", sv.chip_repair_first.display)
          .replace("{chip_repair_additional}", sv.chip_repair_additional.display);
      }
    }
    return { question: it.question, answer };
  });
}

// A plain array from page data. Eleventy's computed-data proxy cannot take concat() or spread on
// its dependency pass (Symbol lookups), so arrays are copied with an index loop first.
function list(a) {
  const out = [];
  if (!a) return out;
  for (let i = 0; i < a.length; i++) out.push(a[i]);
  return out;
}

function gatedRows(data, rows) {
  return list(rows).map((r) => ({
    label: r.label,
    fallback: r.fallback,
    cell: priceParts(P.entryAt(data.pricing, r.price), MODE)
  }));
}

module.exports = {
  eleventyComputed: {
    pr_car: (data) => {
      const pr = data.pricing || {};
      const a = pr.auto_tint || {};
      const sec = data.pages.prices.sections.car;
      const byId = {};
      (pr.vehicle_classes || []).forEach((c) => { byId[c.id] = c; });
      const classes = list(sec.class_order).map((id) => byId[id]).filter(Boolean);
      const rows = [];
      list(sec.rows).forEach((r) => {
        if (a.coverage && a.coverage[r.key]) rows.push({ label: r.label, cells: classes.map((c) => priceParts(a.coverage[r.key][c.id], MODE)) });
      });
      list(sec.lines).forEach((r) => {
        if (a.panels && a.panels[r.key]) rows.push({ label: r.label, cells: classes.map((c) => priceParts(a.panels[r.key][c.id], MODE)) });
      });
      const anyShown = rows.some((r) => r.cells.some((c) => c.show));
      const fvp = classes.map((c) => ({ label: c.label, f: P.fullVsParts(pr, c.id, MODE) })).filter((x) => x.f);
      // Peak pass R2 (visual R1 item 18): vehicle classes whose every cell prints the same thing share one
      // column ("Car, SUV or pickup"), so the table never repeats identical figures side by side. Cells
      // compare on what prints (shown, value, the From word, the draft tag); nothing is merged when any
      // cell differs. groups[].ids lists the classes in each column.
      const sig = (ci) => rows.map((r) => { const q = r.cells[ci] || {}; return [!!q.show, q.value || "", !!q.from, !!q.draft].join("|"); }).join("~");
      const groups = [];
      classes.forEach((c, ci) => {
        const g = groups.find((x) => x.sig === sig(ci));
        if (g) { g.ids.push(c.id); g.labels.push(c.label); }
        else groups.push({ sig: sig(ci), ci, id: c.id, ids: [c.id], labels: [c.label] });
      });
      const joinOr = (l) => (l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " or " + l[l.length - 1]);
      const cols = groups.map((g) => ({
        id: g.id,
        label: joinOr(g.labels.map((l, i) => (i === 0 || /^[A-Z]{2,}$/.test(l) ? l : l.toLowerCase()))),
        ci: g.ci
      }));
      const rowsByCol = rows.map((r) => ({ label: r.label, cells: cols.map((c) => r.cells[c.ci]) }));
      const fvpCols = cols.map((c) => ({ label: c.label, f: P.fullVsParts(pr, c.id, MODE) })).filter((x) => x.f);
      return { classes, rows, any_shown: anyShown, fvp: fvpCols, cols, rows_by_col: rowsByCol, merged: cols.length < classes.length };
    },
    pr_home: (data) => gatedRows(data, data.pages.prices.sections.home.rows),
    pr_ws: (data) => gatedRows(data, data.pages.prices.sections.windshield.rows),
    pr_any: (data) => {
      const pr = data.pricing || {};
      const sec = data.pages.prices.sections;
      const all = [];
      const a = pr.auto_tint || {};
      [a.coverage || {}, a.panels || {}].forEach((g) => Object.keys(g).forEach((k) => Object.keys(g[k]).forEach((c) => all.push(g[k][c]))));
      list(sec.home.rows).forEach((r) => all.push(P.entryAt(pr, r.price)));
      list(sec.windshield.rows).forEach((r) => all.push(P.entryAt(pr, r.price)));
      return all.some((e) => P.priceFor(e, MODE).show);
    },
    pr_has_auto: (data) => P.anyAutoPrice(data.pricing, MODE),
    pr_reviewed: (data) => {
      const d = data.pricing && data.pricing.reviewed_on;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
      if (!m || +m[2] < 1 || +m[2] > 12) return "";
      return data.pages.prices.reviewed_line.replace("{date}", MONTHS[+m[2] - 1] + " " + +m[3] + ", " + m[1]);
    },
    pr_faq: (data) => faqItems(data),
    schema_ld: (data) => {
      const pg = data.pages.prices;
      const pr = data.pricing || {};
      const url = S.pageUrl(data.slug);
      // Offers only for prices the PUBLIC site shows (status confirmed AND publish true). This page
      // prints the same production numbers, so visible prices and markup match (blueprint 6.1).
      const offers = [];
      function offer(name, entry) {
        const r = P.priceFor(entry, "production");
        if (!r.show || r.draft) return;
        const o = { "@type": "Offer", name, priceCurrency: pr.currency || "USD", url };
        if (/^(from|typically)\b/i.test(r.display)) {
          o.priceSpecification = { "@type": "PriceSpecification", minPrice: Array.isArray(entry.range) ? entry.range[0] : entry.amount, priceCurrency: pr.currency || "USD" };
          if (Array.isArray(entry.range)) o.priceSpecification.maxPrice = entry.range[1];
        } else {
          o.price = entry.amount;
        }
        offers.push(o);
      }
      const a = pr.auto_tint || {};
      const sec = pg.sections;
      (pr.vehicle_classes || []).forEach((c) => {
        list(sec.car.rows).forEach((r) => a.coverage && a.coverage[r.key] && offer(r.label + ", " + c.plural, a.coverage[r.key][c.id]));
        list(sec.car.lines).forEach((r) => a.panels && a.panels[r.key] && offer(r.label + ", " + c.plural, a.panels[r.key][c.id]));
      });
      list(sec.home.rows).forEach((r) => offer(r.label, P.entryAt(pr, r.price)));
      list(sec.windshield.rows).forEach((r) => offer(r.label, P.entryAt(pr, r.price)));
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
