import { useSearchParams } from 'react-router-dom';
import { SafeImage } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, queryString, timeAgo } from '../lib/format.js';
import { useTitle } from '../lib/hooks.js';
import { useAdmin, useAdminResource } from './AdminContext.jsx';
import { AdminEmpty, PageHead, loadingOrError } from './ui.jsx';

export default function ProductsPage() {
  useTitle('Products | PriceRadar Admin');
  const toast = useToast();
  const { request, lookups } = useAdmin();
  const [params, setParams] = useSearchParams();

  // Filters live in the URL, so a filtered list survives a refresh.
  const f = {
    q: params.get('q') ?? '',
    source: params.get('source') ?? '',
    category: params.get('category') ?? '',
    visibility: params.get('visibility') ?? '',
    page: Number(params.get('page')) || 1,
  };
  const hidden = f.visibility === 'hidden' ? 1 : f.visibility === 'visible' ? 0 : '';
  const query = queryString({ limit: 25, page: f.page, q: f.q, source: f.source, category: f.category, hidden });
  const exportQuery = queryString({ q: f.q, source: f.source, category: f.category });

  const resource = useAdminResource((signal) => request(`/api/admin/products${query}`, { signal }), [query]);
  const blocked = loadingOrError(resource);
  if (blocked) return blocked;
  const data = resource.data;

  const setFilters = (next) => {
    const out = {};
    for (const [key, value] of Object.entries(next)) {
      if (value === '' || (key === 'page' && value <= 1)) continue;
      out[key] = String(value);
    }
    setParams(out);
  };

  function applyFilters(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setFilters({
      q: String(fd.get('q') || '').trim(), source: fd.get('source'), category: fd.get('category'),
      visibility: fd.get('visibility'), page: 1,
    });
  }

  async function toggleHidden(p) {
    const hide = !p.hidden;
    try {
      await request(`/api/admin/products/${p.id}`, { method: 'PATCH', body: { hidden: hide } });
      toast(hide ? 'Hidden from the shop' : 'Visible on the shop');
      resource.reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function remove(p) {
    if (!window.confirm('Delete this product from the database? The next scrape may add it back. Use Hide to keep it off the shop.')) return;
    try {
      await request(`/api/admin/products/${p.id}`, { method: 'DELETE' });
      toast('Product deleted');
      resource.reload();
    } catch (err) { toast(err.message, 'error'); }
  }

  // total is null when the search could not count every match. Then Next depends on hasMore.
  const countText = data.total === null ? 'Many' : data.total.toLocaleString('en-US');
  const hasNext = data.total === null ? data.hasMore : data.page < data.pages;
  const truncatedNote = data.truncated ? ' The search checks a limited number of products, so narrow the filters for complete results.' : '';

  return (
    <>
      <PageHead title="Products" subtitle={`${countText} products match. Hidden products stay in the database but are not shown on the shop.${truncatedNote}`}>
        <a className="btn ghost" href={`/api/admin/export.csv${exportQuery}`}>Export CSV</a>
      </PageHead>

      <form className="toolbar-inline" key={`${f.q}|${f.source}|${f.category}|${f.visibility}`} onSubmit={applyFilters}>
        <input className="wide" name="q" type="search" defaultValue={f.q} placeholder="Search by name" />
        <select name="source" defaultValue={f.source}>
          <option value="">All stores</option>
          {lookups.sources.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
        <select name="category" defaultValue={f.category}>
          <option value="">All categories</option>
          {lookups.categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
        <select name="visibility" defaultValue={f.visibility}>
          <option value="">All</option>
          <option value="visible">Visible only</option>
          <option value="hidden">Hidden only</option>
        </select>
        <button className="btn small-btn" type="submit">Apply</button>
      </form>

      {data.items.length ? (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Product</th><th>Store</th><th>Categories</th><th>Price</th><th>Discount</th><th>Last seen</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {p.image ? <SafeImage src={p.image} mini loading="lazy" /> : <div className="thumb-mini"></div>}
                        <div className="name-cell" title={p.name}>
                          {p.url ? <a href={p.url} target="_blank" rel="noopener">{p.name}</a> : p.name}
                        </div>
                      </div>
                    </td>
                    <td>{p.sourceName}</td>
                    <td className="small">{p.categories || '—'}</td>
                    <td className="num">
                      {money(p.price, p.currency)}
                      {p.oldPrice ? <div className="small muted"><s>{money(p.oldPrice, p.currency)}</s></div> : null}
                    </td>
                    <td>{p.discount ? `-${Math.round(p.discount)}%` : '—'}</td>
                    <td>{timeAgo(p.lastSeenAt)}</td>
                    <td>{p.hidden ? <span className="badge">Hidden</span> : <span className="badge ok">Visible</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn small-btn ghost" type="button" onClick={() => toggleHidden(p)}>{p.hidden ? 'Show' : 'Hide'}</button>{' '}
                      <button className="btn small-btn ghost" type="button" style={{ color: 'var(--bad)' }} onClick={() => remove(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager-inline">
            <button className="btn small-btn ghost" type="button" disabled={data.page <= 1} onClick={() => setFilters({ ...f, page: data.page - 1 })}>← Prev</button>
            <span>Page {data.page}{data.total === null ? '' : ` of ${data.pages}`}</span>
            <button className="btn small-btn ghost" type="button" disabled={!hasNext} onClick={() => setFilters({ ...f, page: data.page + 1 })}>Next →</button>
          </div>
        </>
      ) : <AdminEmpty icon="📦" title="No products found" text="Run a scrape, or clear the filters." />}
    </>
  );
}
