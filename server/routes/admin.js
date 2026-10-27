import { Router } from 'express';
import { config } from '../config.js';
import { clearSessionCookie, currentToken, login, logout, requireAdmin, setSessionCookie } from '../lib/auth.js';
import { col } from '../lib/collections.js';
import { clean, commitOps, getAllDocs, nowIso } from '../lib/docs.js';
import { FieldValue } from '../lib/firebase.js';
import { exportProducts, listProducts } from '../lib/query.js';
import { slugify } from '../lib/parse.js';
import { PRESETS } from '../scraper/presets.js';
import { getSchedulerState, runAdHoc, runScheduleNow } from '../scheduler.js';

export const adminRouter = Router();

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const notFound = (message) => Object.assign(new Error(message), { status: 404 });
const conflict = (message) => Object.assign(new Error(message), { status: 409 });

const text = (value, max, field) => {
  const s = String(value ?? '').trim();
  if (!s) throw bad(`${field} is required`);
  if (s.length > max) throw bad(`${field} must be ${max} characters or fewer`);
  return s;
};
const optionalText = (value, max) => String(value ?? '').trim().slice(0, max) || null;
const intIn = (value, min, max, field) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${field} must be between ${min} and ${max}`);
  return n;
};
const httpUrl = (value, field) => {
  const s = text(value, 300, field);
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    return u.href;
  } catch {
    throw bad(`${field} must be a valid http or https URL`);
  }
};

/** Document IDs come from the URL. Reject anything that could address a nested path. */
const docId = (value, message = 'Not found') => {
  const id = String(value ?? '');
  if (!id || id.length > 200 || id.includes('/')) throw notFound(message);
  return id;
};
/** Document IDs taken from a request body. A bad ID is a validation error, not a 404. */
const refId = (value, label) => {
  const id = String(value ?? '').trim();
  if (!id || id.length > 200 || id.includes('/')) throw bad(`Choose a valid ${label}`);
  return id;
};

async function requireSource(value) {
  const snap = await col.sources.doc(refId(value, 'source')).get();
  if (!snap.exists) throw bad('Choose a valid source');
  return snap;
}
async function requireCategory(value) {
  const snap = await col.categories.doc(refId(value, 'category')).get();
  if (!snap.exists) throw bad('Choose a valid category');
  return snap;
}

/** Creates a document. An existing ID becomes a 409 with a readable message. */
async function createOnce(ref, data, message) {
  try {
    await ref.create(clean(data));
  } catch (err) {
    if (err.code === 6) throw conflict(message); // ALREADY_EXISTS
    throw err;
  }
}

const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''));

/** Removes products and their price history in batches. */
async function deleteProductDocs(refs) {
  if (refs.length === 0) return;
  const histories = await Promise.all(refs.map((ref) => ref.collection('priceHistory').get()));
  const ops = [];
  histories.forEach((history) => history.docs.forEach((doc) => ops.push({ type: 'delete', ref: doc.ref })));
  refs.forEach((ref) => ops.push({ type: 'delete', ref }));
  await commitOps(ops);
}

/** Keeps the denormalised store fields on products in step with the source document. */
async function syncSourceProducts(sourceId, { name, enabled }) {
  const snap = await col.products.where('sourceSlug', '==', sourceId).get();
  const ops = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const visible = enabled && d.hidden !== true;
    if (d.sourceName === name && d.sourceEnabled === enabled && d.visible === visible) continue;
    ops.push({ type: 'update', ref: doc.ref, data: { sourceName: name, sourceEnabled: enabled, visible } });
  }
  await commitOps(ops);
}

// ---------- Auth ----------

adminRouter.post('/login', (req, res) => {
  const token = login(String(req.body?.username ?? ''), String(req.body?.password ?? ''));
  if (!token) return res.status(401).json({ error: 'Wrong username or password' });
  setSessionCookie(res, token);
  res.json({ ok: true, username: config.adminUsername });
});

adminRouter.post('/logout', (req, res) => {
  const token = currentToken(req);
  if (token) logout(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

adminRouter.get('/session', requireAdmin, (req, res) => {
  res.json({ username: config.adminUsername });
});

// Everything below requires a signed-in admin.
adminRouter.use(requireAdmin);

adminRouter.get('/presets', (req, res) => {
  res.json(Object.entries(PRESETS).map(([key, p]) => ({ key, ...p })));
});

// ---------- Dashboard ----------

adminRouter.get('/stats', async (req, res) => {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [products, hidden, sources, categories, active, runs, failures] = await Promise.all([
    col.products.count().get(),
    col.products.where('hidden', '==', true).count().get(),
    col.sources.count().get(),
    col.categories.count().get(),
    col.schedules.where('enabled', '==', true).count().get(),
    col.scrapeRuns.where('startedAt', '>=', cutoff).count().get(),
    col.scrapeRuns.where('status', '==', 'failed').where('startedAt', '>=', cutoff).count().get(),
  ]);

  res.json({
    products: products.data().count,
    hiddenProducts: hidden.data().count,
    sources: sources.data().count,
    categories: categories.data().count,
    activeSchedules: active.data().count,
    runs24h: runs.data().count,
    failures24h: failures.data().count,
    scheduler: getSchedulerState(),
    serverTime: nowIso(),
  });
});

// ---------- Sources ----------

function sourceFromBody(body) {
  const name = text(body.name, 80, 'Name');
  const searchUrlTemplate = httpUrl(body.searchUrlTemplate, 'Search URL template');
  if (!searchUrlTemplate.includes('{query}')) throw bad('Search URL template must contain {query}');
  const currency = String(body.currency || 'KES').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw bad('Currency must be a 3 letter code such as KES or USD');

  const sel = body.selectors ?? {};
  const selectors = {};
  for (const key of ['item', 'name', 'price', 'oldPrice', 'discount', 'rating', 'link', 'image']) {
    selectors[key] = optionalText(sel[key], 300) || '';
  }
  if (!selectors.item) throw bad('The product card selector is required');
  if (!selectors.name) throw bad('The product name selector is required');
  selectors.link = selectors.link || 'a';

  return {
    name,
    baseUrl: httpUrl(body.baseUrl, 'Base URL'),
    searchUrlTemplate,
    currency,
    selectors,
    enabled: body.enabled !== false,
  };
}

adminRouter.get('/sources', async (req, res) => {
  const snap = await col.sources.get();
  const counts = await Promise.all(
    snap.docs.map((doc) => col.products.where('sourceSlug', '==', doc.id).count().get()),
  );
  const sources = snap.docs.map((doc, i) => ({
    id: doc.id,
    slug: doc.id,
    ...doc.data(),
    productCount: counts[i].data().count,
  }));
  res.json(sources.sort(byName));
});

adminRouter.post('/sources', async (req, res) => {
  const data = sourceFromBody(req.body ?? {});
  const id = slugify(data.name) || 'source';
  await createOnce(col.sources.doc(id), { ...data, slug: id, createdAt: nowIso() }, 'A store with this name already exists');
  res.status(201).json({ id });
});

adminRouter.put('/sources/:id', async (req, res) => {
  const id = docId(req.params.id, 'Source not found');
  const ref = col.sources.doc(id);
  if (!(await ref.get()).exists) throw notFound('Source not found');

  const data = sourceFromBody(req.body ?? {});
  await ref.update(clean(data));
  await syncSourceProducts(id, data);
  res.json({ ok: true });
});

adminRouter.delete('/sources/:id', async (req, res) => {
  const id = docId(req.params.id, 'Source not found');
  const [products, schedules] = await Promise.all([
    col.products.where('sourceSlug', '==', id).get(),
    col.schedules.where('sourceId', '==', id).get(),
  ]);
  await deleteProductDocs(products.docs.map((doc) => doc.ref));
  await commitOps(schedules.docs.map((doc) => ({ type: 'delete', ref: doc.ref })));
  await col.sources.doc(id).delete();
  res.json({ ok: true });
});

// ---------- Categories ----------

const categoryFromBody = (body) => ({
  name: text(body.name, 60, 'Name'),
  searchTerm: text(body.searchTerm, 120, 'Search term'),
  emoji: optionalText(body.emoji, 8),
});

adminRouter.get('/categories', async (req, res) => {
  const snap = await col.categories.get();
  const counts = await Promise.all(
    snap.docs.map((doc) => col.products.where('categorySlugs', 'array-contains', doc.id).count().get()),
  );
  const categories = snap.docs.map((doc, i) => ({
    id: doc.id,
    slug: doc.id,
    name: doc.get('name'),
    searchTerm: doc.get('searchTerm'),
    emoji: doc.get('emoji') ?? null,
    productCount: counts[i].data().count,
  }));
  res.json(categories.sort(byName));
});

adminRouter.post('/categories', async (req, res) => {
  const data = categoryFromBody(req.body ?? {});
  const id = slugify(data.name) || 'category';
  await createOnce(col.categories.doc(id), { ...data, slug: id, createdAt: nowIso() }, 'A category with this name already exists');
  res.status(201).json({ id });
});

adminRouter.put('/categories/:id', async (req, res) => {
  const ref = col.categories.doc(docId(req.params.id, 'Category not found'));
  if (!(await ref.get()).exists) throw notFound('Category not found');
  await ref.update(clean(categoryFromBody(req.body ?? {})));
  res.json({ ok: true });
});

adminRouter.delete('/categories/:id', async (req, res) => {
  const id = docId(req.params.id, 'Category not found');
  const [schedules, products] = await Promise.all([
    col.schedules.where('categoryId', '==', id).get(),
    col.products.where('categorySlugs', 'array-contains', id).get(),
  ]);
  await commitOps([
    ...schedules.docs.map((doc) => ({ type: 'delete', ref: doc.ref })),
    // Products stay, they just lose this category.
    ...products.docs.map((doc) => ({ type: 'update', ref: doc.ref, data: { categorySlugs: FieldValue.arrayRemove(id) } })),
    { type: 'delete', ref: col.categories.doc(id) },
  ]);
  res.json({ ok: true });
});

// ---------- Schedules ----------

/** A schedule's ID is its store and category, so each pair can have only one schedule. */
const scheduleId = (sourceId, categoryId) => `${sourceId}__${categoryId}`;

async function scheduleFields(body) {
  const source = await requireSource(body.sourceId);
  const category = await requireCategory(body.categoryId);
  return {
    sourceId: source.id,
    categoryId: category.id,
    maxPages: intIn(body.maxPages, 1, config.maxPagesLimit, 'Pages per run'),
    intervalMinutes: intIn(body.intervalMinutes, config.minIntervalMinutes, 10080, 'Interval (minutes)'),
    enabled: body.enabled !== false,
  };
}

adminRouter.get('/schedules', async (req, res) => {
  const snap = await col.schedules.get();
  const schedules = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const [sources, categories] = await Promise.all([
    getAllDocs([...new Set(schedules.map((s) => s.sourceId))].map((id) => col.sources.doc(id))),
    getAllDocs([...new Set(schedules.map((s) => s.categoryId))].map((id) => col.categories.doc(id))),
  ]);
  const sourceMap = new Map(sources.filter((s) => s.exists).map((s) => [s.id, s.data()]));
  const categoryMap = new Map(categories.filter((c) => c.exists).map((c) => [c.id, c.data()]));

  const rows = schedules.map((s) => ({
    id: s.id,
    sourceId: s.sourceId,
    categoryId: s.categoryId,
    sourceName: sourceMap.get(s.sourceId)?.name ?? 'Deleted source',
    categoryName: categoryMap.get(s.categoryId)?.name ?? 'Deleted category',
    categoryEmoji: categoryMap.get(s.categoryId)?.emoji ?? null,
    maxPages: s.maxPages,
    intervalMinutes: s.intervalMinutes,
    enabled: s.enabled === true,
    nextRunAt: s.nextRunAt ?? null,
    lastRunAt: s.lastRunAt ?? null,
    lastStatus: s.lastStatus ?? null,
  }));
  rows.sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.categoryName.localeCompare(b.categoryName));
  res.json(rows);
});

adminRouter.post('/schedules', async (req, res) => {
  const fields = await scheduleFields(req.body ?? {});
  const now = nowIso();
  const id = scheduleId(fields.sourceId, fields.categoryId);
  // nextRunAt is now, so the first run happens on the next scheduler tick.
  await createOnce(
    col.schedules.doc(id),
    { ...fields, nextRunAt: now, lastRunAt: null, lastStatus: null, createdAt: now },
    'This store and category already have a schedule',
  );
  res.status(201).json({ id });
});

adminRouter.put('/schedules/:id', async (req, res) => {
  const oldId = docId(req.params.id, 'Schedule not found');
  const oldRef = col.schedules.doc(oldId);
  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) throw notFound('Schedule not found');

  const fields = await scheduleFields(req.body ?? {});
  const newId = scheduleId(fields.sourceId, fields.categoryId);
  const nextRunAt = fields.enabled ? (oldSnap.get('nextRunAt') ?? nowIso()) : null;
  const data = { ...fields, nextRunAt };

  if (newId === oldId) {
    await oldRef.update(clean(data));
  } else {
    // The store or category changed, which changes the ID. Create the new schedule, then remove the old one.
    await createOnce(
      col.schedules.doc(newId),
      { ...oldSnap.data(), ...data },
      'This store and category already have a schedule',
    );
    await oldRef.delete();
  }
  res.json({ ok: true });
});

adminRouter.delete('/schedules/:id', async (req, res) => {
  await col.schedules.doc(docId(req.params.id, 'Schedule not found')).delete();
  res.json({ ok: true });
});

adminRouter.post('/schedules/:id/run', async (req, res) => {
  const result = await runScheduleNow(docId(req.params.id, 'Schedule not found'));
  if (!result.ok) {
    if (result.reason === 'Schedule not found') throw notFound(result.reason);
    return res.status(409).json({ error: result.reason });
  }
  res.status(202).json({ ok: true });
});

adminRouter.post('/scrape', async (req, res) => {
  const sourceId = (await requireSource(req.body?.sourceId)).id;
  const categoryId = (await requireCategory(req.body?.categoryId)).id;
  const maxPages = intIn(req.body?.maxPages ?? 3, 1, config.maxPagesLimit, 'Pages per run');
  await runAdHoc({ sourceId, categoryId, maxPages });
  res.status(202).json({ ok: true });
});

// ---------- Products ----------

adminRouter.get('/products', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const result = await listProducts(req.query, { includeHidden: true, page, limit });

  const slugs = [...new Set(result.items.flatMap((p) => p.categorySlugs ?? []))];
  const categorySnaps = await getAllDocs(slugs.map((slug) => col.categories.doc(slug)));
  const names = new Map(categorySnaps.filter((c) => c.exists).map((c) => [c.id, c.get('name')]));

  res.json({
    items: result.items.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url ?? null,
      image: p.image ?? null,
      currency: p.currency ?? null,
      price: p.price ?? null,
      oldPrice: p.oldPrice ?? null,
      discount: p.discountPercent ?? null,
      rating: p.rating ?? null,
      hidden: p.hidden === true,
      lastSeenAt: p.lastSeenAt ?? null,
      sourceName: p.sourceName ?? null,
      categories: (p.categorySlugs ?? []).map((slug) => names.get(slug)).filter(Boolean).join(', '),
    })),
    total: result.total,
    page,
    pages: result.pages,
    hasMore: result.hasMore,
    truncated: result.truncated,
  });
});

adminRouter.patch('/products/:id', async (req, res) => {
  const ref = col.products.doc(docId(req.params.id, 'Product not found'));
  if (typeof req.body?.hidden !== 'boolean') throw bad('hidden must be true or false');
  const snap = await ref.get();
  if (!snap.exists) throw notFound('Product not found');

  const hidden = req.body.hidden;
  await ref.update({ hidden, visible: !hidden && snap.get('sourceEnabled') === true });
  res.json({ ok: true });
});

adminRouter.delete('/products/:id', async (req, res) => {
  // The next scrape may list this product again. Hide it to keep it off the site permanently.
  await deleteProductDocs([col.products.doc(docId(req.params.id, 'Product not found'))]);
  res.json({ ok: true });
});

// ---------- Runs ----------

const RUN_LIST_FIELDS = [
  'trigger', 'status', 'pagesScraped', 'productsFound', 'productsNew', 'productsChanged',
  'error', 'startedAt', 'finishedAt', 'sourceName', 'categoryName',
];

adminRouter.get('/runs', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const status = ['running', 'success', 'failed'].includes(req.query.status) ? req.query.status : null;

  let query = col.scrapeRuns;
  if (status) query = query.where('status', '==', status);
  const snap = await query.orderBy('startedAt', 'desc').limit(limit).select(...RUN_LIST_FIELDS).get();
  res.json(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
});

adminRouter.get('/runs/:id', async (req, res) => {
  const snap = await col.scrapeRuns.doc(docId(req.params.id, 'Run not found')).get();
  if (!snap.exists) throw notFound('Run not found');
  res.json({ id: snap.id, ...snap.data() });
});

// ---------- Export ----------

/** Quotes a CSV cell and neutralises spreadsheet formulas, since product names come from third-party sites. */
const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const EXPORT_COLUMNS = [
  'id', 'source', 'name', 'price', 'old_price', 'discount_percent', 'rating', 'rating_percent',
  'currency', 'url', 'image', 'hidden', 'first_seen_at', 'last_seen_at', 'categories',
];

adminRouter.get('/export.csv', async (req, res) => {
  const products = await exportProducts(req.query, { includeHidden: true });
  const rows = products.map((p) => ({
    id: p.id,
    source: p.sourceName,
    name: p.name,
    price: p.price,
    old_price: p.oldPrice,
    discount_percent: p.discountPercent,
    rating: p.rating,
    rating_percent: p.ratingPercent,
    currency: p.currency,
    url: p.url,
    image: p.image,
    hidden: p.hidden === true ? 1 : 0,
    first_seen_at: p.firstSeenAt,
    last_seen_at: p.lastSeenAt,
    categories: (p.categorySlugs ?? []).join('|'),
  }));

  const lines = [EXPORT_COLUMNS.join(','), ...rows.map((row) => EXPORT_COLUMNS.map((key) => csvCell(row[key])).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});
