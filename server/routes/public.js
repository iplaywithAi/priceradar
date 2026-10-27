import { Router } from 'express';
import { col } from '../lib/collections.js';
import { getAllDocs } from '../lib/docs.js';
import { listProducts, toItem } from '../lib/query.js';

export const publicRouter = Router();

// Product IDs look like "<store-slug>_<32 hex characters>". Anything else is a 404 before a read.
const PRODUCT_ID = /^[a-z0-9-]+_[a-f0-9]{32}$/;

const pageInt = (value, fallback, max) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
};

/** Public product shape used by the shop and product pages (snake_case). */
export function toCard(p) {
  return {
    id: p.id,
    name: p.name,
    url: p.url ?? null,
    image: p.image ?? null,
    currency: p.currency ?? null,
    price: p.price ?? null,
    old_price: p.oldPrice ?? null,
    discount_percent: p.discountPercent ?? null,
    rating: p.rating ?? null,
    rating_percent: p.ratingPercent ?? null,
    hidden: p.hidden === true,
    first_seen_at: p.firstSeenAt ?? null,
    last_seen_at: p.lastSeenAt ?? null,
    source_id: p.sourceSlug ?? null,
    source_name: p.sourceName ?? null,
    source_slug: p.sourceSlug ?? null,
  };
}

const byName = (a, b) => a.name.localeCompare(b.name);

publicRouter.get('/stats', async (req, res) => {
  const [products, sources, categories, lastRun] = await Promise.all([
    col.products.where('visible', '==', true).count().get(),
    col.sources.where('enabled', '==', true).count().get(),
    col.categories.count().get(),
    col.scrapeRuns.where('status', '==', 'success').orderBy('finishedAt', 'desc').limit(1).get(),
  ]);

  res.json({
    products: products.data().count,
    sources: sources.data().count,
    categories: categories.data().count,
    lastUpdated: lastRun.empty ? null : lastRun.docs[0].get('finishedAt'),
  });
});

publicRouter.get('/categories', async (req, res) => {
  const snap = await col.categories.get();
  const categories = snap.docs.map((doc) => ({ id: doc.id, slug: doc.id, name: doc.get('name'), emoji: doc.get('emoji') ?? null }));
  const counts = await Promise.all(
    categories.map((c) => col.products
      .where('visible', '==', true)
      .where('categorySlugs', 'array-contains', c.id)
      .count()
      .get()),
  );
  res.json(categories
    .map((c, i) => ({ ...c, productCount: counts[i].data().count }))
    .sort(byName));
});

publicRouter.get('/sources', async (req, res) => {
  const snap = await col.sources.where('enabled', '==', true).get();
  const sources = snap.docs.map((doc) => ({
    id: doc.id,
    slug: doc.id,
    name: doc.get('name'),
    baseUrl: doc.get('baseUrl'),
    currency: doc.get('currency'),
  }));
  const counts = await Promise.all(
    sources.map((s) => col.products
      .where('visible', '==', true)
      .where('sourceSlug', '==', s.id)
      .count()
      .get()),
  );
  res.json(sources
    .map((s, i) => ({ ...s, productCount: counts[i].data().count }))
    .sort(byName));
});

publicRouter.get('/products', async (req, res) => {
  const limit = pageInt(req.query.limit, 24, 100);
  const page = pageInt(req.query.page, 1, 100000);
  const result = await listProducts(req.query, { page, limit });

  res.json({
    items: result.items.map(toCard),
    total: result.total,
    page,
    limit,
    pages: result.pages,
    hasMore: result.hasMore,
    truncated: result.truncated,
  });
});

publicRouter.get('/products/:id', async (req, res) => {
  if (!PRODUCT_ID.test(req.params.id)) return res.status(404).json({ error: 'Product not found' });

  const snap = await col.products.doc(req.params.id).get();
  if (!snap.exists || snap.get('visible') !== true) return res.status(404).json({ error: 'Product not found' });
  const product = toItem(snap);

  const categorySnaps = await getAllDocs((product.categorySlugs ?? []).map((slug) => col.categories.doc(slug)));
  const categories = categorySnaps
    .filter((c) => c.exists)
    .map((c) => ({ name: c.get('name'), slug: c.id }))
    .sort(byName);

  const historySnap = await snap.ref.collection('priceHistory').orderBy('recordedAt', 'asc').limit(365).get();
  const history = historySnap.docs.map((doc) => ({
    price: doc.get('price') ?? null,
    oldPrice: doc.get('oldPrice') ?? null,
    recordedAt: doc.get('recordedAt') ?? null,
  }));

  res.json({ ...toCard(product), categories, history });
});
