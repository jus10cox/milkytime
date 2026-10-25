# Milky Time Shop

A searchable gallery of every product recommended in the Milky Time newsletter.

- `site/` is the whole website: `index.html`, `items.json` (the product list) and `thumbs/` (product images).
- `scripts/fetch-thumbnails.mjs` finds a preview image for each product and saves a small thumbnail.

## Get thumbnails (one time, on your Mac)

Needs Node 18 or newer (`node -v` to check).

```
npm install
npm run thumbs
```

It takes about 5 to 10 minutes for ~500 products. It only fetches products that don't have a thumbnail yet,
and skips ones it already failed on, so it's safe to re-run. Use `npm run thumbs -- --retry-missing` to try the failures again, or `-- --force` to redo everything.

Anything it couldn't find is listed in `thumbs-missing.csv`. To fix one by hand, copy the image address
from the product page (right-click the photo, Copy Image Address) and add it to `thumb-overrides.json`:

```
{ "123": "https://example.com/the-product-photo.jpg" }
```

Then run `npm run thumbs` again.

## Preview the site

```
npm run serve
```

## Publishing

Every push to `main` runs the "Build and publish site" action. It fetches thumbnails for any new
products, commits them, and publishes `site/` to GitHub Pages.

## Adding new picks

Add entries to the end of `site/items.json` with the next `id` and push. Each run of the thumbnail
script visits every ShopMy link that still has no photo, so expect a few extra clicks in ShopMy stats.

## Recap email

After each publish that adds new products, the site emails a recap (photos, names and notes) to Miranda.
It sends from a Gmail account using three repository secrets (Settings → Secrets and variables → Actions):

- `GMAIL_USER`: the Gmail address to send from
- `GMAIL_APP_PASSWORD`: an app password for that account (https://myaccount.google.com/apppasswords)
- `RECAP_TO`: who receives it (comma-separate several addresses)

If any are missing, the step is skipped. To preview the email locally, run
`RECAP_DRY_RUN=1 GMAIL_USER=x GMAIL_APP_PASSWORD=x RECAP_TO=x node scripts/email-recap.mjs HEAD~1`,
which writes `recap-preview.html`.
