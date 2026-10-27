import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SafeImage, EmptyState, SiteHeader, Stars } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { money, queryString, timeAgo } from '../lib/format.js';
import { useDebouncedField, useResource, useTitle } from '../lib/hooks.js';

const PER_PAGE = 24;
const DEFAULTS = { q: '', category: '', source: '', minPrice: '', maxPrice: '', onSale: '', sort: 'newest', page: 1 };

/* The URL is the single source of truth for filters, so filtered views can be shared. */

function readFilters(params) {
  return {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    source: params.get('source') ?? '',
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
    onSale: params.get('onSale') ?? '',
    sort: params.get('sort') || DEFAULTS.sort,
    page: Number(params.get('page')) || 1,
  };
}

function toParams(filters) {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== DEFAULTS[key] && value !== '') out[key] = String(value);
  }
  return out;
}

function summaryText(data) {
  if (!data.items.length) return 'No products match these filters';
  const from = (data.page - 1) * PER_PAGE + 1;
  let text;
  // total is null when the search could not count every match (see the server's scan cap).
  if (data.total === null) {
    const to = from + data.items.length - 1;
    text = `Showing ${from}–${to} products${data.hasMore ? ', and more' : ''}`;
  } else {
    const to = Math.min(data.page * PER_PAGE, data.total);
    text = `Showing ${from}–${to} of ${data.total.toLocaleString('en-US')} products`;
  }
  return data.truncated ? `${text}. Narrow the filters to see more.` : text;
}

function ProductCard({ p }) {
  const hasSale = p.discount_percent > 0 || (p.old_price && p.price && p.old_price > p.price);
  const discount = p.discount_percent ? `-${Math.round(p.discount_percent)}%` : '';
  const href = `/product/${encodeURIComponent(p.id)}`;

  return (
    <article className="card">
      <Link className="thumb" to={href} aria-label={`View ${p.name}`}>
        {p.image
          ? <SafeImage src={p.image} loading="lazy" />
          : <div className="placeholder" aria-hidden="true">🛍️</div>}
        {hasSale && discount ? <span className="badge sale sale-tag">{discount}</span> : null}
      </Link>
      <div className="card-body">
        <span className="source-tag">{p.source_name}</span>
        <h3 className="card-title"><Link to={href}>{p.name}</Link></h3>
        <div className="price-row">
          <span className="price">{money(p.price, p.currency)}</span>
          {p.old_price ? <s className="old">{money(p.old_price, p.currency)}</s> : null}
        </div>
        <div><Stars percent={p.rating_percent} rating={p.rating} /></div>
        <div className="card-foot">
          <Link className="btn ghost small-btn" to={href}>Details</Link>
          {p.url ? <a className="btn small-btn" href={p.url} target="_blank" rel="noopener nofollow">Store ↗</a> : null}
        </div>
      </div>
    </article>
  );
}

export default function ShopPage() {
  useTitle('PriceRadar | Compare prices across Kenyan online stores');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);

  const update = (patch, { resetPage = true } = {}) => {
    setParams(toParams({ ...filters, ...patch, ...(resetPage ? { page: 1 } : {}) }), { replace: true });
  };

  /* Lookups for the chips, store filter and hero stats */
  const meta = useResource(
    (signal) => Promise.all([api('/api/categories', { signal }), api('/api/sources', { signal }), api('/api/stats', { signal })]),
    [],
  );
  useEffect(() => {
    if (meta.error) toast(`Could not load filters: ${meta.error.message}`, 'error');
  }, [meta.error, toast]);
  const [categories = [], sources = [], stats = null] = meta.data ?? [];

  /* Products for the current filters */
  const query = queryString({
    limit: PER_PAGE, page: filters.page, sort: filters.sort, q: filters.q, category: filters.category,
    source: filters.source, minPrice: filters.minPrice, maxPrice: filters.maxPrice, onSale: filters.onSale ? '1' : '',
  });
  const products = useResource((signal) => api(`/api/products${query}`, { signal }), [query]);
  useEffect(() => {
    if (products.error) toast(products.error.message, 'error');
  }, [products.error, toast]);

  /* Search box and price inputs keep local text and commit to the URL when typing pauses */
  const [qText, setQText] = useState(filters.q);
  useEffect(() => { setQText(filters.q); }, [filters.q]);
  const [minText, setMinText] = useDebouncedField(filters.minPrice, (v) => update({ minPrice: v }));
  const [maxText, setMaxText] = useDebouncedField(filters.maxPrice, (v) => update({ maxPrice: v }));

  const totalCategoryProducts = categories.reduce((sum, c) => sum + c.productCount, 0);
  const chips = [{ slug: '', name: 'All', emoji: '✨', productCount: totalCategoryProducts }, ...categories];
  const data = products.data;

  const goToPage = (page) => {
    update({ page }, { resetPage: false });
    window.scrollTo({ top: 260, behavior: 'smooth' });
  };

  let resultText = 'Loading products…';
  if (products.error && !data) resultText = 'Could not load products';
  else if (data) resultText = summaryText(data);

  return (
    <>
      <SiteHeader link={{ to: '/admin/', label: 'Admin' }} />

      <section className="hero">
        <div className="container">
          <h1>Find the best price, <span>before you buy.</span></h1>
          <p className="lede">Live listings pulled from online stores across Kenya. Search shoes, electronics, clothing and more, then filter by price, discount and rating.</p>
          <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: qText.trim() }); }}>
            <input type="search" name="q" value={qText} onChange={(e) => setQText(e.target.value)}
              placeholder="Try “Nike Air”, “Samsung”, “hoodie”…" aria-label="Search products" autoComplete="off" />
            <button className="btn" type="submit">Search</button>
          </form>
          <div className="stat-row">
            {stats ? (
              <>
                <span><strong>{stats.products.toLocaleString('en-US')}</strong>products tracked</span>
                <span><strong>{stats.sources}</strong>stores</span>
                <span><strong>{stats.categories}</strong>categories</span>
                <span>Updated {timeAgo(stats.lastUpdated)}</span>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <div className="toolbar">
        <div className="container">
          <div className="chips" role="tablist" aria-label="Categories">
            {chips.map((c) => (
              <button key={c.slug} type="button" role="tab" aria-selected={filters.category === c.slug}
                className={`chip ${filters.category === c.slug ? 'active' : ''}`}
                onClick={() => update({ category: c.slug })}>
                <span>{c.emoji || '•'}</span>{c.name} <small>{c.productCount}</small>
              </button>
            ))}
          </div>
          <div className="filters">
            <select aria-label="Store" value={filters.source} onChange={(e) => update({ source: e.target.value })}>
              <option value="">All stores</option>
              {sources.map((s) => <option key={s.slug} value={s.slug}>{s.name} ({s.productCount})</option>)}
            </select>
            <input type="number" placeholder="Min price" min="0" aria-label="Minimum price"
              value={minText} onChange={(e) => setMinText(e.target.value)} />
            <input type="number" placeholder="Max price" min="0" aria-label="Maximum price"
              value={maxText} onChange={(e) => setMaxText(e.target.value)} />
            <label className="check">
              <input type="checkbox" checked={!!filters.onSale} onChange={(e) => update({ onSale: e.target.checked ? '1' : '' })} /> On sale only
            </label>
            <select aria-label="Sort results" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="newest">Recently updated</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="discount">Biggest discount</option>
              <option value="rating">Top rated</option>
            </select>
          </div>
        </div>
      </div>

      <main className="container">
        <div className="result-meta"><span>{resultText}</span></div>
        <div className="grid" aria-live="polite">
          {products.loading
            ? Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton skeleton-card" aria-hidden="true" />)
            : data?.items.length
              ? data.items.map((p) => <ProductCard key={p.id} p={p} />)
              : data
                ? (
                  <EmptyState icon="🔎" title="Nothing here yet" style={{ gridColumn: '1 / -1' }}
                    text="Try a different search, clear the price filters, or pick another category.">
                    <button className="btn ghost" type="button" onClick={() => setParams({}, { replace: true })}>Reset filters</button>
                  </EmptyState>
                )
                : null}
        </div>
        {data && data.pages > 1 ? (
          <nav className="pager" aria-label="Pagination">
            <button className="btn ghost small-btn" type="button" disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)}>← Previous</button>
            <span className="muted small">Page {data.page} of {data.pages}</span>
            <button className="btn ghost small-btn" type="button" disabled={data.page >= data.pages} onClick={() => goToPage(data.page + 1)}>Next →</button>
          </nav>
        ) : null}
      </main>

      <footer className="site-foot">
        <div className="container">
          <span>PriceRadar. Prices and ratings are copied from the source stores and may change. Always confirm on the store page.</span>
          <span>{stats?.lastUpdated ? `Last refresh ${timeAgo(stats.lastUpdated)}` : ''}</span>
        </div>
      </footer>
    </>
  );
}
