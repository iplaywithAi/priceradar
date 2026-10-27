import { config } from '../config.js';
import { col } from './collections.js';

/** Sort options map to a Firestore orderBy field and direction. */
export const SORTS = {
  newest: ['lastSeenAt', 'desc'],
  price_asc: ['price', 'asc'],
  price_desc: ['price', 'desc'],
  discount: ['discountPercent', 'desc'],
  rating: ['ratingPercent', 'desc'],
};

const BATCH = 200;
const num = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const toItem = (doc) => ({ id: doc.id, ...doc.data() });

/**
 * Builds the Firestore query for a product listing.
 *
 * Pushed into Firestore: visibility, one of category or store (category wins),
 * the sort, and the price range when sorting by price. Discount sorts use a discount > 0 range.
 *
 * Everything else (free-text search, the second store filter, on-sale and hidden flags, and a
 * price range when not sorting by price) is checked in memory by `predicate`.
 */
export function buildProductQuery(params = {}, { includeHidden = false } = {}) {
  const sort = SORTS[params.sort] ? params.sort : 'newest';
  const [orderField, direction] = SORTS[sort];
  const minPrice = num(params.minPrice);
  const maxPrice = num(params.maxPrice);
  const onSale = params.onSale === '1' || params.onSale === 'true';
  const terms = String(params.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const category = params.category ? String(params.category) : '';
  const source = params.source ? String(params.source) : '';

  let query = col.products;
  if (!includeHidden) query = query.where('visible', '==', true);

  const checks = [];
  if (category) query = query.where('categorySlugs', 'array-contains', category);
  else if (source) query = query.where('sourceSlug', '==', source);
  if (category && source) checks.push((d) => d.sourceSlug === source);

  if (orderField === 'price') {
    // Products without a price are excluded from price sorts by the >= 0 range
    query = query.where('price', '>=', minPrice ?? 0);
    if (maxPrice !== null) query = query.where('price', '<=', maxPrice);
  } else {
    if (minPrice !== null) checks.push((d) => typeof d.price === 'number' && d.price >= minPrice);
    if (maxPrice !== null) checks.push((d) => typeof d.price === 'number' && d.price <= maxPrice);
  }

  if (orderField === 'discountPercent') query = query.where('discountPercent', '>', 0);
  else if (onSale) checks.push((d) => (d.discountPercent ?? 0) > 0);

  if (terms.length) {
    checks.push((d) => {
      const name = String(d.name ?? '').toLowerCase();
      return terms.every((term) => name.includes(term));
    });
  }
  if (params.hidden === '1') checks.push((d) => d.hidden === true);
  else if (params.hidden === '0') checks.push((d) => d.hidden !== true);

  query = query.orderBy(orderField, direction);
  return {
    query,
    predicate: (data) => checks.every((check) => check(data)),
    inMemory: checks.length > 0,
  };
}

/** Reads matching documents in batches until `wanted` matches are found, the collection ends, or the scan cap is hit. */
async function scanMatches(query, predicate, { wanted, cap = config.scanCap }) {
  const matches = [];
  let scanned = 0;
  let cursor = null;
  let exhausted = false;

  while (matches.length < wanted) {
    const requested = Math.min(BATCH, cap - scanned);
    if (requested <= 0) break;
    let batchQuery = query.limit(requested);
    if (cursor) batchQuery = batchQuery.startAfter(cursor);

    const snap = await batchQuery.get();
    scanned += snap.size;
    for (const doc of snap.docs) {
      if (predicate(doc.data())) matches.push(doc);
    }
    if (snap.size < requested) {
      exhausted = true;
      break;
    }
    cursor = snap.docs[snap.docs.length - 1];
  }
  return { matches, scanned, exhausted };
}

/**
 * One page of products. `total` is exact when Firestore can count the query, and when a scan
 * reaches the end of the collection. Otherwise it is null and `hasMore` tells the UI whether to show Next.
 */
export async function listProducts(params, { includeHidden = false, page = 1, limit = 24 } = {}) {
  const { query, predicate, inMemory } = buildProductQuery(params, { includeHidden });
  const skip = (page - 1) * limit;

  if (!inMemory) {
    const [count, snap] = await Promise.all([query.count().get(), query.offset(skip).limit(limit).get()]);
    const total = count.data().count;
    return {
      items: snap.docs.map(toItem),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      hasMore: skip + limit < total,
      truncated: false,
    };
  }

  const scan = await scanMatches(query, predicate, { wanted: skip + limit + 1 });
  const hasMore = scan.matches.length > skip + limit;
  const total = scan.exhausted ? scan.matches.length : null;
  return {
    items: scan.matches.slice(skip, skip + limit).map(toItem),
    total,
    page,
    pages: total !== null ? Math.max(1, Math.ceil(total / limit)) : page + (hasMore ? 1 : 0),
    hasMore,
    truncated: !scan.exhausted && scan.scanned >= config.scanCap,
  };
}

/** Every matching product, for CSV export. Stops at the scan cap. */
export async function exportProducts(params, { includeHidden = true } = {}) {
  const { query, predicate } = buildProductQuery(params, { includeHidden });
  const scan = await scanMatches(query, predicate, { wanted: Infinity, cap: 50000 });
  return scan.matches.map(toItem);
}
