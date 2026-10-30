// The one link-preview image (og:image, twitter:image) for pages without a photo of their own
// (peak pass R1, 2026-10-30, technical finding 10: those pages shared logo.png, 1612 x 600, which
// every platform crops). Read by scripts/images.js (renders the file) and lib/eleventy-og.js
// (global data og_share for layouts/v3.njk), so the crop, the size and the alt live in one place.
//
// Source: the real storefront master (images-src/v3/storefront-shop-sign.jpg, 4032 x 3024), cropped to
// the 1.91:1 share shape and scaled DOWN to 1200 x 630 (no upscale): "1633", the whole star and logo
// panel on the window, the arch shadow. Same x as the storefront-band crop (visual finding 8); it keeps
// the customer's Bronco and the door with the old Instagram decal (decisions-and-rules line 42) out of
// frame and stops above the window lettering row.
"use strict";
module.exports = {
  master: "storefront-shop-sign",
  crop: { ref: [4032, 3024], x: 2205, y: 662, w: 1320, h: 693 },
  width: 1200,
  height: 630,
  file: "og-share-1200x630.jpg",
  path: "images/v3/og-share-1200x630.jpg",
  // printed into an HTML attribute as is, so the ampersand is written as an entity
  alt: "The front of the BC Glass &amp; Tint shop at 1633 Boulder City Pkwy, with the BC logo on the window."
};
