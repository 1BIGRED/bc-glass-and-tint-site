# BC Glass & Tint: Eleventy site, edited with Sveltia CMS

The bcglassandtint.com website, rebuilt from the hand-edited `09 - Website\BC-Glass-Tint-site`
folder into Eleventy (Nunjucks templates) with every word of copy moved into editable data files.
The built pages are byte for byte the same as the live site (line endings aside).

Build: `npm run build` writes the site to `_site`
Dev server: `npm run dev`

## Deploy

Once this repo is linked, Netlify builds and publishes it automatically from the `main` branch
(continuous deploy, settings in `netlify.toml`: `npm run build`, publish `_site`, Node 22).
Linking needs someone logged in to the shop's own Netlify, never the studio's.

Until that link is made, the live method does not change: Chase's manual drop of the OLD folder
`09 - Website\BC-Glass-Tint-site` to Netlify is what the public sees. Nothing in this repo is live yet.

## Where things live

- `_data/site.json`: business facts. Name, phone, public email, address, map position, hours,
  social links, the business description used for search engines, and the review counts and
  ratings. Re-read the live Google listing (and Yelp and Tint Wiz) before changing a count; every
  page fills the counts in from here.
- `_data/pages/<page>.json`: all the wording of one page (title tag, description, headings,
  paragraphs, lists, reviews, FAQ questions and answers, image descriptions). `shared.json` holds
  the wording that repeats on every page: header, footer, quote form and cookie banner.
  Edit wording here, never in the templates.
- Review counts are never typed into page wording. Write a token and it is filled from
  `site.json`: `{google_rating}`, `{google_count}`, `{yelp_rating}`, `{yelp_count}`,
  `{tintwiz_rating}`, `{tintwiz_count}`.
- `_data/frame.json`: per-page layout switches (which header layout, which style rules, which
  icons). Studio only; the office never needs it.
- `*.njk` (root): one template per page, with front matter for the page address, images and icons.
  The eight service pages use `_includes/layouts/service.njk` and are front matter only (blinds adds
  its two extra sections in its body).
- `<page>.11tydata.js`: builds that page's structured data (JSON-LD) from its wording file and
  `site.json`, through the helpers in `lib/schema.js`. Structured data is never typed by hand.
  There is one business record, `https://bcglassandtint.com/#business`, and no star-rating markup.
- `_includes/`: the shared pieces every page is assembled from (head tags, analytics consent,
  stylesheets, header, footer, quote form, cookie banner, scripts).
- `admin/index.html`, `admin/config.yml`: the Sveltia CMS editor. `config.yml` has no `base_url`
  on purpose; that is what makes the editor sign in through Netlify.
- `images/`, `assets/`, the icons and logos, `site.webmanifest`, `robots.txt`, `sitemap.xml`,
  `_redirects`, `preview.html`: copied into the build exactly as they are.

## Rules built into the templates

- Accessibility: `_includes/a11y-block.njk` is the managed accessibility block. For this site it
  replaces the studio script `scripts\Fix-SiteA11y.ps1`: change the rules in the partial and
  rebuild. Never edit the block in a built page, and do not run the old script against this repo.
- Quote form: `_includes/quote.njk`. Every page that has the form keeps `name="quote"` and the same
  field set. The VIN field is plain HTML behind its hidden wrapper (shown when "Windshield
  Replacement" is ticked), never added by script. Each page sets only its `source` value and,
  where it has one, the service ticked by default.
- FAQ: on every page with a visible FAQ, the FAQ structured data is generated from the same
  questions and answers the page shows, so changing an answer in the page's JSON file changes both.
- The `google-site-verification` tag stays on the home page (from `site.json`).
- The only Instagram link anywhere is `https://www.instagram.com/bc.glassandtint/`.
- Wording is stored as the exact HTML source (entities such as `&amp;` and links included) and
  printed unescaped, so the build does not change a byte of it.

## Building one page at a time

Two settings let several people work on different pages without breaking each other's builds:

- `BC_ONLY`: a comma list of page names. Only those pages are built; every other page template is
  skipped.
- `BC_OUT`: a folder to build into instead of `_site`.

PowerShell example:

```powershell
$env:BC_ONLY='chip-repair,henderson'; $env:BC_OUT='C:\temp\bc-out'; npx @11ty/eleventy; Remove-Item Env:BC_ONLY; Remove-Item Env:BC_OUT
```

## Checking a build

Both checks live in `09 - Website\scripts\` (outside this repo):

- Parity with the live site, every file:
  `powershell -File "..\scripts\Compare-BCParity.ps1" -Built ".\_site"`
  Add `-Only chip-repair.html,henderson.html` to check single pages. Each file is reported as
  IDENTICAL, IDENTICAL-EXCEPT-EOL (same once the live file's Windows line endings are made plain),
  DIFFERENT (with the first difference shown), MISSING-IN-BUILT or EXTRA-IN-BUILT. The two CMS
  files under `admin/` are the only expected extras.
- Site verifier (typography, links, structured data, form labels, banned claims):
  `powershell -File "..\scripts\Verify-BCSite.ps1" -SitePath ".\_site"`

Run both before every deploy. Neither one changes a file.

## Copy rules

Anything a customer or the office can read (page wording, CMS labels and hints, this file) has no
em dashes, no en dashes, no double hyphens and no emojis. Windshield replacement is subcontracted:
never write that the shop does that labor.
