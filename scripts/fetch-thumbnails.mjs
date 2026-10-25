// Finds a preview image for each product in site/items.json and saves a small
// thumbnail to site/thumbs/<id>.webp. Run: npm run thumbs
// Items already listed in thumbs-missing.csv are skipped, so stores aren't hit again on every run.
// Flags: -- --retry-missing tries those again; -- --force redoes everything.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ITEMS = path.join(ROOT, "site/items.json");
const THUMBS = path.join(ROOT, "site/thumbs");
const OVERRIDES = path.join(ROOT, "thumb-overrides.json"); // { "123": "https://image-url" }
const MISSING = path.join(ROOT, "thumbs-missing.csv");
const FORCE = process.argv.includes("--force");
const RETRY = FORCE || process.argv.includes("--retry-missing");
const CONCURRENCY = 4;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const data = JSON.parse(await fs.readFile(ITEMS, "utf8"));
const overrides = JSON.parse(await fs.readFile(OVERRIDES, "utf8").catch(() => "{}"));
await fs.mkdir(THUMBS, { recursive: true });

async function get(url, accept) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": UA, accept, "accept-language": "en-US,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

// Pull the best preview image out of a product page's HTML.
function findImage(html, base) {
  const meta = (attr, name) =>
    html.match(new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']+)`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*${attr}=["']${name}["']`, "i"))?.[1];
  let src = meta("property", "og:image") ?? meta("name", "og:image") ?? meta("name", "twitter:image") ?? meta("property", "twitter:image");
  if (!src) {
    const ld = html.match(/"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*"url"\s*:\s*)?"([^"]+)"/i);
    src = ld?.[1];
  }
  if (!src) return null;
  src = src.replace(/&amp;/g, "&").replace(/\\u002F/g, "/");
  try { return new URL(src, base).href; } catch { return null; }
}

// Amazon blocks page scraping, but serves product images by ASIN.
function amazonImage(url) {
  const asin = url.match(/amazon\.com\/(?:.*\/)?dp\/([A-Z0-9]{10})/)?.[1];
  return asin ? `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg` : null;
}

async function thumbFor(item) {
  let img = overrides[item.id] ?? amazonImage(item.href);
  if (!img) {
    const page = await get(item.href, "text/html");
    img = findImage(await page.text(), page.url);
    if (!img) {
      // The page itself might redirect to Amazon after the ShopMy hop.
      img = amazonImage(page.url);
      if (!img) throw new Error(`no preview image on ${new URL(page.url).host}`);
    }
  }
  const res = await get(img, "image/*");
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  if ((meta.width ?? 0) < 60) throw new Error("image too small (probably a placeholder)");
  const file = `${item.id}.webp`;
  await sharp(buf)
    .resize(480, 480, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 72 })
    .toFile(path.join(THUMBS, file));
  return `thumbs/${file}`;
}

// Keep earlier misses (unless retrying) so a run only visits new products.
const prevMissing = new Map();
for (const line of (await fs.readFile(MISSING, "utf8").catch(() => "")).split("\n").slice(1)) {
  const id = Number(line.match(/^"?(\d+)/)?.[1]);
  if (id) prevMissing.set(id, line);
}
const todo = data.items.filter((i) => FORCE || overrides[i.id] || (!i.img && (RETRY || !prevMissing.has(i.id))));
console.log(`Fetching thumbnails for ${todo.length} of ${data.items.length} items...`);
const missing = [];
let done = 0, ok = 0;

async function worker() {
  while (todo.length) {
    const item = todo.shift();
    try {
      item.img = await thumbFor(item);
      ok++;
    } catch (e) {
      missing.push([item.id, item.name, item.href, e.message]);
    }
    done++;
    if (done % 25 === 0) {
      console.log(`  ${done} checked, ${ok} found`);
      await fs.writeFile(ITEMS, JSON.stringify(data, null, 1));
    }
    await new Promise((r) => setTimeout(r, 400)); // be polite to the stores
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await fs.writeFile(ITEMS, JSON.stringify(data, null, 1));

const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;
const rows = new Map(RETRY ? [] : prevMissing);
for (const r of missing) rows.set(r[0], r.map(csv).join(","));
for (const i of data.items) if (i.img) rows.delete(i.id);
await fs.writeFile(MISSING, ["id,name,link,reason", ...[...rows.keys()].sort((a, b) => a - b).map((k) => rows.get(k))].join("\n"));
console.log(`Done: ${ok} new thumbnails, ${missing.length} not found (listed in thumbs-missing.csv).`);
console.log(`To fix one by hand, add "id": "image URL" to thumb-overrides.json and run again.`);
