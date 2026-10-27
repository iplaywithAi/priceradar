import { config } from '../config.js';
import { col } from '../lib/collections.js';
import { commitOps, getAllDocs, nowIso } from '../lib/docs.js';
import { FieldValue } from '../lib/firebase.js';
import { absoluteUrl, cleanText, cleanUrl, parseMoney, parsePercent, parseRating, productDocId, productKey } from '../lib/parse.js';
import { autoScroll, launchBrowser, openPage } from './browser.js';
import { extractListing } from './extract.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Turns a raw scraped row into a clean product record, or null if it has no name. */
function normalize(raw, source) {
  const name = cleanText(raw.name);
  if (!name) return null;

  const url = cleanUrl(absoluteUrl(raw.href, source.baseUrl));
  const price = parseMoney(raw.priceText);
  const oldPrice = parseMoney(raw.oldPriceText);
  let discount = parsePercent(raw.discountText);
  if (discount === null && price && oldPrice && oldPrice > price) {
    discount = Math.round(((oldPrice - price) / oldPrice) * 1000) / 10;
  }

  return {
    externalId: productKey(url, name),
    name,
    url,
    image: absoluteUrl(raw.image, source.baseUrl),
    price,
    oldPrice: oldPrice && price && oldPrice > price ? oldPrice : null,
    discount,
    rating: parseRating(raw.ratingText),
    ratingPercent: raw.ratingPercent ?? null,
  };
}

/** Visits the search pages for one source and query, returning de-duplicated products. */
export async function scrapeListings({ source, query, maxPages, log }) {
  const browser = await launchBrowser();
  const seen = new Set();
  const products = [];
  let pagesScraped = 0;

  try {
    const page = await openPage(browser);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = source.searchUrlTemplate
        .replaceAll('{query}', encodeURIComponent(query))
        .replaceAll('{page}', String(pageNum));
      log(`Page ${pageNum}: ${url}`);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: config.navTimeoutMs });
      } catch (err) {
        log(`Navigation problem on page ${pageNum}: ${err.message}`);
        if (pageNum === 1) throw err;
        break;
      }

      const hasItems = await page
        .waitForSelector(source.selectors.item, { timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      if (!hasItems) {
        log(`No product cards found on page ${pageNum}, stopping.`);
        break;
      }

      await autoScroll(page);
      const rows = await extractListing(page, source.selectors);
      pagesScraped++;

      let fresh = 0;
      for (const raw of rows) {
        const product = normalize(raw, source);
        if (!product || seen.has(product.externalId)) continue;
        seen.add(product.externalId);
        products.push(product);
        fresh++;
      }
      log(`Page ${pageNum}: ${rows.length} cards, ${fresh} new`);

      if (fresh === 0) break; // repeated page, nothing more to collect
      if (pageNum < maxPages) await sleep(config.pageDelayMs);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return { products, pagesScraped };
}

/**
 * Upserts products keyed by store and product hash, links them to the category, and writes a
 * priceHistory entry when a product is new or its price changes.
 */
export async function saveProducts({ products, source, category }) {
  const now = nowIso();
  const refs = products.map((p) => col.products.doc(productDocId(source.id, p.externalId)));
  const snapshots = await getAllDocs(refs);
  const ops = [];
  let created = 0;
  let changed = 0;

  products.forEach((p, i) => {
    const ref = refs[i];
    const snap = snapshots[i];
    const history = {
      price: p.price,
      oldPrice: p.oldPrice,
      recordedAt: now,
    };

    if (!snap.exists) {
      created++;
      ops.push({
        type: 'set',
        ref,
        data: {
          externalId: p.externalId,
          sourceSlug: source.id,
          sourceName: source.name,
          sourceEnabled: source.enabled !== false,
          name: p.name,
          url: p.url,
          image: p.image,
          currency: source.currency,
          price: p.price,
          oldPrice: p.oldPrice,
          discountPercent: p.discount,
          rating: p.rating,
          ratingPercent: p.ratingPercent,
          categorySlugs: [category.id],
          hidden: false,
          visible: source.enabled !== false,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      ops.push({ type: 'set', ref: ref.collection('priceHistory').doc(), data: history });
      return;
    }

    const existing = snap.data();
    if (existing.price !== p.price || existing.oldPrice !== p.oldPrice) {
      changed++;
      ops.push({ type: 'set', ref: ref.collection('priceHistory').doc(), data: history });
    }
    ops.push({
      type: 'update',
      ref,
      data: {
        name: p.name,
        url: p.url,
        image: p.image ?? existing.image ?? null,
        currency: source.currency,
        sourceName: source.name,
        price: p.price,
        oldPrice: p.oldPrice,
        discountPercent: p.discount,
        rating: p.rating,
        ratingPercent: p.ratingPercent,
        categorySlugs: FieldValue.arrayUnion(category.id),
        lastSeenAt: now,
      },
    });
  });

  await commitOps(ops);
  return { created, changed };
}

/**
 * Runs one scrape job end to end and records it in scrapeRuns.
 * Never throws: failures are stored on the run so the admin can see them.
 */
export async function runScrapeJob({ sourceId, categoryId, maxPages, trigger, scheduleId = null }) {
  const sourceSnap = await col.sources.doc(sourceId).get();
  const categorySnap = await col.categories.doc(categoryId).get();
  if (!sourceSnap.exists || !categorySnap.exists) {
    return { status: 'failed', error: 'Store or category no longer exists' };
  }
  const source = { id: sourceSnap.id, ...sourceSnap.data() };
  const category = { id: categorySnap.id, ...categorySnap.data() };

  const runRef = col.scrapeRuns.doc();
  const startedAt = nowIso();
  await runRef.set({
    scheduleId,
    sourceId: source.id,
    sourceName: source.name,
    categoryId: category.id,
    categoryName: category.name,
    trigger,
    status: 'running',
    pagesScraped: 0,
    productsFound: 0,
    productsNew: 0,
    productsChanged: 0,
    error: null,
    log: '',
    startedAt,
    finishedAt: null,
  });

  const lines = [];
  const log = (message) => {
    const line = `${new Date().toISOString().slice(11, 19)}  ${message}`;
    lines.push(line);
    console.log(`[run ${runRef.id}] ${message}`);
  };

  const result = { status: 'success', pagesScraped: 0, found: 0, created: 0, changed: 0, error: null };

  try {
    log(`Starting "${category.name}" on ${source.name} (up to ${maxPages} pages)`);
    const { products, pagesScraped } = await scrapeListings({
      source,
      query: category.searchTerm,
      maxPages,
      log,
    });
    result.pagesScraped = pagesScraped;
    result.found = products.length;

    if (products.length === 0) {
      throw new Error('No products found. Check the search URL and CSS selectors for this source.');
    }

    const { created, changed } = await saveProducts({ products, source, category });
    result.created = created;
    result.changed = changed;
    log(`Saved ${products.length} products: ${created} new, ${changed} with price changes`);
  } catch (err) {
    result.status = 'failed';
    result.error = err.message;
    log(`Failed: ${err.message}`);
  }

  const finishedAt = nowIso();
  await runRef.update({
    status: result.status,
    pagesScraped: result.pagesScraped,
    productsFound: result.found,
    productsNew: result.created,
    productsChanged: result.changed,
    error: result.error,
    log: lines.slice(-200).join('\n'),
    finishedAt,
  });

  if (scheduleId) {
    // The schedule may have been deleted while the job ran. Ignore that case.
    await col.schedules.doc(scheduleId).update({ lastRunAt: finishedAt, lastStatus: result.status }).catch(() => {});
  }

  return { runId: runRef.id, ...result };
}
