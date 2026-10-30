// Structured data (JSON-LD) helpers for BC Glass & Tint.
//
// Every JSON-LD block on the site is built here from _data/site.json and the page's own
// wording file, then printed with the `jsonld` filter (plain JSON.stringify). Nothing in
// structured data is hand-typed in a template.
//
// Key order matters: the live site's blocks are minified JSON, and the build must print
// them byte for byte, so each helper builds its object in a fixed key order. Where pages
// differ in order (the Service node, the breadcrumb), the helper takes an option.
//
// Rules that live here and nowhere else:
//   - ONE business node, @id https://bcglassandtint.com/#business, built only from site.json.
//   - No star-rating or review-count markup in structured data, ever.
//   - FAQPage questions and answers are generated from the SAME items the page shows,
//     through faqPlain(), so the visible FAQ and the schema cannot drift apart.

const ORIGIN = "https://bcglassandtint.com";
const platformLib = require("./platform");
const BUSINESS_ID = ORIGIN + "/#business";
const WEBSITE_ID = ORIGIN + "/#website";

// ---------------------------------------------------------------------------------------
// faqPlain: visible FAQ HTML -> schema text.
// Tags become a space, entities are decoded, runs of whitespace collapse to one space,
// and the ends are trimmed. This is exactly how the live schema text was produced, which
// is why a link inside an answer leaves a space before the following full stop
// ("...explained . Source: ..."): that is the live text, reproduced, not a bug.
// ---------------------------------------------------------------------------------------
// Named entities the site uses, by code point (kept as numbers so this file stays plain ASCII).
const NAMED_CODES = {
  amp: 38, lt: 60, gt: 62, quot: 34, apos: 39, nbsp: 160, middot: 183, copy: 169, reg: 174,
  trade: 8482, deg: 176, rsquo: 8217, lsquo: 8216, rdquo: 8221, ldquo: 8220, hellip: 8230,
  times: 215, frac12: 189, frac14: 188, frac34: 190, bull: 8226, ndash: 8211, mdash: 8212,
  eacute: 233, ntilde: 241
};
const NAMED = {};
for (const k of Object.keys(NAMED_CODES)) NAMED[k] = String.fromCodePoint(NAMED_CODES[k]);

function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
  });
}

function faqPlain(html) {
  const noTags = String(html == null ? "" : html).replace(/<[^>]*>/g, " ");
  // v3 (blueprint C20): a tag that ends right before punctuation must not leave a stray space
  // ("explained ." or "built ,"), so the space before , . ; : ! ? is closed up after collapsing.
  return decodeEntities(noTags).replace(/\s+/g, " ").replace(/ ([,.;:!?])/g, "$1").trim();
}

// Page titles and other attribute text are stored as HTML source (with &amp; and so on);
// schema wants the decoded text.
function plain(html) {
  return decodeEntities(String(html == null ? "" : html));
}

// ---------------------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------------------
function pageUrl(slug) {
  return slug && slug !== "index" ? ORIGIN + "/" + slug : ORIGIN + "/";
}

function place(p) {
  // { type: "City", name, region } -> schema node, in the live key order.
  const o = { "@type": p.type || "City", name: p.name };
  if (p.region) o.addressRegion = p.region;
  return o;
}

function cities(list) {
  // A page may give a plain city name ("Henderson") or a full place object.
  const one = (c) => place(typeof c === "string" ? { type: "City", name: c, region: "NV" } : c);
  return Array.isArray(list) ? list.map(one) : one(list);
}

// ---------------------------------------------------------------------------------------
// Closures (engineering 3.2.1): one OpeningHoursSpecification per closure date inside the next
// 60 days, closed all day (opens and closes both 00:00, validFrom and validThrough that date).
// The window is measured from the build day, so every deploy keeps it current. hours_unknown
// days get no entry (the shop has not said what they are).
// ---------------------------------------------------------------------------------------
function addDays(dateStr, n) {
  const dt = new Date(dateStr + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function closureSpecs(site, today) {
  const list = Array.isArray(site.closures) ? site.closures : [];
  if (!list.length) return [];
  const from = today || platformLib.today(process.env, site.hours && site.hours.timezone);
  const days = require("../_data/platform.json").closure_schema_window_days || 60;
  const until = addDays(from, days);
  return list
    .filter((c) => c && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.date >= from && c.date <= until)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((c) => ({
      "@type": "OpeningHoursSpecification",
      opens: "00:00",
      closes: "00:00",
      validFrom: c.date,
      validThrough: c.date
    }));
}

// ---------------------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------------------
function businessNode(site, opts) {
  opts = opts || {};
  const n = {
    // v3 (engineering 3.8): AutoGlassShop is not a schema.org type (404) and Google ignores
    // additionalType. Both listed types return 200 on schema.org.
    "@type": ["AutomotiveBusiness", "HomeAndConstructionBusiness"],
    "@id": BUSINESS_ID,
    alternateName: site.alternate_name,
    name: site.name,
    url: site.url,
    image: site.schema_images.slice(),
    logo: site.logo,
    telephone: site.phone.schema,
    email: site.email,
    foundingDate: site.founding_year,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      addressLocality: site.address.city,
      addressRegion: site.address.region,
      postalCode: site.address.postal_code,
      addressCountry: site.address.country
    },
    geo: { "@type": "GeoCoordinates", latitude: site.geo.latitude, longitude: site.geo.longitude },
    openingHours: site.hours.schema,
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: site.hours.days.slice(),
        opens: site.hours.opens,
        closes: site.hours.closes
      }
    ].concat(closureSpecs(site, opts.today)),
    areaServed: site.area_served.map(place),
    sameAs: site.same_as.slice()
  };
  // The home page alone lists the service catalog, right after sameAs.
  if (opts.offerCatalog) n.hasOfferCatalog = opts.offerCatalog;
  n.description = site.description;
  n.paymentAccepted = site.payment_accepted;
  n.hasMap = site.maps_url;
  return n;
}

// The home page's hasOfferCatalog, from pages.home.schema.offer_catalog:
// { name, area_served: [cities], items: [ { name, url, id } ] }
// Live key order per offered service: @type, name, url, areaServed, @id.
function offerCatalog(cat) {
  if (!cat) return undefined;
  return {
    "@type": "OfferCatalog",
    name: cat.name,
    itemListElement: (cat.items || []).map((it) => {
      const s = { "@type": "Service", name: it.name, url: it.url };
      const area = it.area_served !== undefined ? it.area_served : cat.area_served;
      if (area !== undefined) s.areaServed = cities(area);
      if (it.id) s["@id"] = it.id;
      return { "@type": "Offer", itemOffered: s };
    })
  };
}

function websiteNode(site) {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: site.url,
    name: site.name,
    publisher: { "@id": BUSINESS_ID },
    inLanguage: "en-US"
  };
}

// opts: { slug, name (plain text), dateModified }
function webpageNode(opts) {
  const url = pageUrl(opts.slug);
  return {
    "@type": "WebPage",
    "@id": url + "#webpage",
    url: url,
    name: opts.name,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": BUSINESS_ID },
    dateModified: opts.dateModified
  };
}

// opts: { slug, name, standalone }  Home -> this page, two levels.
// standalone: true prints the block as its own document (@context, no @id), the way
// new-construction.html carries it.
function breadcrumbNode(opts) {
  const url = pageUrl(opts.slug);
  const items = [
    { "@type": "ListItem", position: 1, name: "Home", item: ORIGIN + "/" },
    { "@type": "ListItem", position: 2, name: opts.name, item: url }
  ];
  if (opts.standalone) {
    return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items };
  }
  return { "@type": "BreadcrumbList", "@id": url + "#breadcrumb", itemListElement: items };
}

// s: { id, service_type, name, url, area_served, description }
// order: which key order this page uses. The live site has three:
//   "service-page" : @type, serviceType, name, url, provider, areaServed, description, @id
//   "id-first"     : @type, @id, serviceType, name, url, provider, areaServed, description
//   "name-first"   : @type, name, serviceType, url, provider, areaServed, description, @id
function serviceNode(s, order) {
  const parts = {
    "@type": "Service",
    "@id": s.id,
    serviceType: s.service_type,
    name: s.name,
    url: s.url,
    provider: { "@id": BUSINESS_ID },
    areaServed: s.area_served === undefined ? undefined : cities(s.area_served),
    description: s.description
  };
  const orders = {
    "service-page": ["@type", "serviceType", "name", "url", "provider", "areaServed", "description", "@id"],
    "id-first": ["@type", "@id", "serviceType", "name", "url", "provider", "areaServed", "description"],
    "name-first": ["@type", "name", "serviceType", "url", "provider", "areaServed", "description", "@id"]
  };
  const keys = orders[order || "service-page"];
  if (!keys) throw new Error("serviceNode: unknown key order " + order);
  const n = {};
  for (const k of keys) if (parts[k] !== undefined) n[k] = parts[k];
  return n;
}

// items: the page's visible faq.items ([{ question, answer }], HTML source).
// opts: { slug, standalone }  standalone prints @context and no @id (qa.html,
// new-construction.html); otherwise the node carries @id <page>#faq for an @graph.
function faqPageNode(items, opts) {
  opts = opts || {};
  const mainEntity = (items || []).map((it) => ({
    "@type": "Question",
    name: faqPlain(it.question),
    acceptedAnswer: { "@type": "Answer", text: faqPlain(it.answer) }
  }));
  if (opts.standalone) {
    return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: mainEntity };
  }
  return { "@type": "FAQPage", "@id": pageUrl(opts.slug) + "#faq", mainEntity: mainEntity };
}

function graph(nodes) {
  return { "@context": "https://schema.org", "@graph": nodes.filter(Boolean) };
}

// ---------------------------------------------------------------------------------------
// Whole-page graph for the service pages (layouts/service.njk).
// pg is the page's wording file. Names are derived from the visible wording so they cannot
// drift: breadcrumb name = hero.crumb, Service description = meta.description, WebPage name =
// meta.title (all decoded). pg.schema may override a name where the live site differs
// (breadcrumb_name, service.description, webpage_name) and carries the rest:
//   { date_modified, service: { service_type, name, area_served: ["Boulder City", ...] } }
// order: "business-first" (Breadcrumb, Business, Service, ...) or "service-first"
// (Breadcrumb, Service, Business, ...); the live pages use both.
// ---------------------------------------------------------------------------------------
function servicePageGraph(site, slug, pg, order) {
  const { fill } = require("./filters");
  const txt = (html) => plain(fill(html));
  const sc = pg.schema || {};
  const sv = sc.service || {};
  const url = pageUrl(slug);
  const bc = breadcrumbNode({ slug, name: sc.breadcrumb_name || txt(pg.hero.crumb) });
  const biz = businessNode(site);
  const svc = serviceNode(
    {
      id: url + "#service",
      service_type: sv.service_type,
      name: sv.name,
      url: url,
      area_served: sv.area_served,
      description: sv.description || txt(pg.meta.description)
    },
    "service-page"
  );
  let nodes;
  if (order === "service-first") nodes = [bc, svc, biz];
  else if (order === "business-first") nodes = [bc, biz, svc];
  else throw new Error("servicePageGraph: order must be business-first or service-first");
  return graph(nodes.concat([
    websiteNode(site),
    webpageNode({ slug, name: sc.webpage_name || txt(pg.meta.title), dateModified: sc.date_modified })
  ]));
}

module.exports = {
  ORIGIN,
  BUSINESS_ID,
  WEBSITE_ID,
  decodeEntities,
  faqPlain,
  plain,
  pageUrl,
  place,
  cities,
  businessNode,
  closureSpecs,
  offerCatalog,
  websiteNode,
  webpageNode,
  breadcrumbNode,
  serviceNode,
  faqPageNode,
  graph,
  servicePageGraph
};
