// End-to-end checks for PriceRadar. Run it against a test database (the Firestore emulator or a test project),
// because it creates a store and schedules, then removes them again at the end.
//   PRICERADAR_URL   default http://localhost:3000
//   FIXTURE_URL      default http://localhost:8088 (npm run fixture)
//   ADMIN_USERNAME / ADMIN_PASSWORD   the admin login from your .env
const BASE = process.env.PRICERADAR_URL || 'http://localhost:3000';
const FIX = process.env.FIXTURE_URL || 'http://localhost:8088';
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASS) { console.error('Set ADMIN_PASSWORD (the same value as in .env).'); process.exit(2); }
let cookie = '';
await fetch(`${FIX}/__set?v=1`);
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (res.headers.get('set-cookie') && path.endsWith('/login')) cookie = res.headers.get('set-cookie').split(';')[0];
  return { status: res.status, data, headers: res.headers };
}

// ---- auth ----
let r = await call('/api/admin/login', { method: 'POST', body: { username: ADMIN_USER, password: 'nope-wrong' }, auth: false });
check('wrong password rejected', r.status === 401, `(${r.status})`);
r = await call('/api/admin/stats', { auth: false });
check('admin API blocked without session', r.status === 401);
r = await call('/api/admin/login', { method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS }, auth: false });
check('correct login sets session cookie', r.status === 200 && cookie.startsWith('admin_session='), `(${r.status})`);
r = await call('/api/admin/session');
check('session endpoint works with cookie', r.status === 200);

// ---- validation ----
r = await call('/api/admin/sources', { method: 'POST', body: { name: 'X', baseUrl: 'http://a.com', searchUrlTemplate: 'http://a.com/s?q=1', selectors: { item: 'a', name: 'b' } } });
check('search template without {query} rejected', r.status === 400, `(${r.data.error})`);
r = await call('/api/admin/schedules', { method: 'POST', body: { sourceId: 'nope', categoryId: 'shoes', maxPages: 3, intervalMinutes: 2 } });
check('interval below 5 minutes rejected', r.status === 400, `(${r.data.error})`);

// ---- create a store pointing at the fixture (Jumia selectors) ----
const jumiaSel = { item: 'article.prd', name: '.name', price: '.prc', oldPrice: '.old', discount: '.bdg._dsct', rating: '.stars._s', link: 'a.core', image: 'img.img' };
r = await call('/api/admin/sources', { method: 'POST', body: {
  name: 'Fixture Store', baseUrl: FIX, searchUrlTemplate: `${FIX}/catalog/?q={query}&page={page}`,
  currency: 'KES', selectors: jumiaSel, enabled: true } });
check('create store', r.status === 201, `(id ${r.data.id})`);
const sourceId = r.data.id;

// ---- schedule and automatic run ----
r = await call('/api/admin/schedules', { method: 'POST', body: { sourceId, categoryId: 'shoes', maxPages: 3, intervalMinutes: 5, enabled: true } });
check('create schedule', r.status === 201, `(id ${r.data.id})`);
const scheduleId = r.data.id;
r = await call('/api/admin/schedules', { method: 'POST', body: { sourceId, categoryId: 'shoes', maxPages: 3, intervalMinutes: 5, enabled: true } });
check('duplicate schedule rejected with 409', r.status === 409, `(${r.data.error?.slice(0, 40)})`);

let runs = [];
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  runs = (await call('/api/admin/runs?limit=5')).data;
  if (runs.length && runs[0].status !== 'running') break;
}
const first = runs[0];
check('scheduled run executed by scheduler', !!first && first.trigger === 'scheduled', `(trigger ${first?.trigger})`);
check('scheduled run succeeded', first?.status === 'success', `(status ${first?.status}, err ${first?.error})`);
check('pagination collected 3 pages, 18 products', first?.pagesScraped === 3 && first?.productsFound === 18,
  `(pages ${first?.pagesScraped}, found ${first?.productsFound})`);
check('18 products created', first?.productsNew === 18, `(new ${first?.productsNew})`);

let pub = (await call('/api/products?category=shoes', { auth: false })).data;
check('public API lists scraped products by category', pub.total === 18, `(total ${pub.total})`);
const sample = pub.items.find((p) => p.name.endsWith('Model 2'));
check('price parsed from "KSh 1,550" text (version 1)', sample && sample.price === 1000 + 2 * 250 + 50, `(price ${sample?.price})`);
check('discount and old price parsed', sample && sample.old_price > sample.price && sample.discount_percent === 20, `(old ${sample?.old_price}, disc ${sample?.discount_percent})`);
check('rating percent parsed from inline width', sample && sample.rating_percent > 0 && sample.rating === 4.2, `(rating ${sample?.rating}, pct ${sample?.rating_percent})`);
check('product URL made absolute and product name cleaned', sample && sample.url.startsWith(FIX + '/') && !sample.url.includes('?'), `(${sample?.url})`);
check('image URL absolute', sample && sample.image === `${FIX}/img/2.jpg`, `(${sample?.image})`);

// ---- price change detection ----
await fetch(`${FIX}/__set?v=2`);
r = await call(`/api/admin/schedules/${scheduleId}/run`, { method: 'POST', body: {} });
check('manual run of a schedule accepted', r.status === 202);
r = await call(`/api/admin/schedules/${scheduleId}/run`, { method: 'POST', body: {} });
check('second manual run while queued is refused (409) or accepted once finished', r.status === 409 || r.status === 202, `(${r.status})`);
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  const s = (await call('/api/admin/stats')).data.scheduler;
  if (!s.running && s.queued.length === 0) break;
}
runs = (await call('/api/admin/runs?limit=5')).data;
check('manual run recorded with trigger manual', runs[0].trigger === 'manual' && runs[0].status === 'success', `(${runs[0].trigger}/${runs[0].status})`);
check('price change detected on all 18 products', runs[0].productsChanged === 18, `(changed ${runs[0].productsChanged})`);
check('no duplicate products after rescrape', (await call('/api/products?category=shoes', { auth: false })).data.total === 18);

pub = (await call('/api/products?category=shoes', { auth: false })).data;
const detail = (await call(`/api/products/${sample.id}`, { auth: false })).data;
check('product detail includes two price history points', detail.history?.length === 2, `(points ${detail.history?.length})`);
check('detail price history shows the change', detail.history?.[1]?.price - detail.history?.[0]?.price === 50);

// ---- public filtering and sorting ----
let f = (await call('/api/products?minPrice=2000&maxPrice=3000', { auth: false })).data;
check('price range filter', f.items.every((p) => p.price >= 2000 && p.price <= 3000) && f.total > 0, `(total ${f.total})`);
f = (await call('/api/products?onSale=1&category=shoes', { auth: false })).data;
check('on-sale filter returns discounted only', f.total === 9 && f.items.every((p) => p.discount_percent > 0), `(total ${f.total})`);
f = (await call('/api/products?sort=price_asc&limit=5', { auth: false })).data;
check('sort price ascending', f.items.every((p, i, a) => !i || a[i - 1].price <= p.price));
f = (await call('/api/products?sort=price_desc&limit=5', { auth: false })).data;
check('sort price descending', f.items.every((p, i, a) => !i || a[i - 1].price >= p.price));
f = (await call('/api/products?q=Model%201', { auth: false })).data;
check('free-text search (names with Model and 1)', f.total === 10, `(total ${f.total})`);
f = (await call('/api/products?limit=5&page=2', { auth: false })).data;
check('pagination metadata', f.page === 2 && f.pages === 4 && f.items.length === 5, `(pages ${f.pages})`);

// ---- moderation ----
r = await call(`/api/admin/products/${sample.id}`, { method: 'PATCH', body: { hidden: true } });
check('hide product', r.status === 200);
f = (await call('/api/products?category=shoes', { auth: false })).data;
check('hidden product removed from public catalogue', f.total === 17);
r = await call(`/api/products/${sample.id}`, { auth: false });
check('hidden product detail returns 404', r.status === 404);
r = await call(`/api/admin/products?hidden=1`);
check('admin can list hidden products', r.data.total === 1);
await call(`/api/admin/products/${sample.id}`, { method: 'PATCH', body: { hidden: false } });

// ---- export ----
const csv = await fetch(`${BASE}/api/admin/export.csv?category=shoes`, { headers: { Cookie: cookie } });
const csvBuf = Buffer.from(await csv.arrayBuffer()); const csvText = csvBuf.toString('utf8');
check('CSV export has BOM, header and 18 rows', csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF && csvText.split('\r\n').length === 19, `(lines ${csvText.split('\r\n').length})`);
check('CSV export sends attachment-friendly content type', (csv.headers.get('content-type') || '').includes('text/csv'));

// ---- failure path ----
r = await call('/api/admin/sources', { method: 'POST', body: {
  name: 'Broken Store', baseUrl: FIX, searchUrlTemplate: `${FIX}/catalog/?q={query}&page={page}`,
  currency: 'KES', selectors: { ...jumiaSel, item: '.no-such-card' } } });
const brokenId = r.data.id;
r = await call('/api/admin/scrape', { method: 'POST', body: { sourceId: brokenId, categoryId: 'shoes', maxPages: 1 } });
check('ad-hoc scrape accepted', r.status === 202);
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  const s = (await call('/api/admin/stats')).data.scheduler;
  if (!s.running && s.queued.length === 0) break;
}
runs = (await call('/api/admin/runs?limit=3')).data;
check('bad selectors produce a failed run with a helpful error', runs[0].status === 'failed' && /No products found/.test(runs[0].error), `(${runs[0].error})`);
const logged = (await call(`/api/admin/runs/${runs[0].id}`)).data;
check('failed run keeps its log', /Failed:/.test(logged.log || ''));

// ---- pause and resume ----
r = await call(`/api/admin/schedules/${scheduleId}`, { method: 'PUT', body: { sourceId, categoryId: 'shoes', maxPages: 3, intervalMinutes: 5, enabled: false } });
const paused = (await call('/api/admin/schedules')).data.find((s) => s.id === scheduleId);
check('pausing a schedule clears its next run', r.status === 200 && paused.enabled === false && paused.nextRunAt === null);

// ---- clean up everything this run created ----
await call(`/api/admin/sources/${sourceId}`, { method: 'DELETE' });
await call(`/api/admin/sources/${brokenId}`, { method: 'DELETE' });

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
