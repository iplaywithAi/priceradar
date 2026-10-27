import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, SafeImage, SiteHeader, Stars } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { dateTime, money, timeAgo } from '../lib/format.js';
import { useResource, useTitle } from '../lib/hooks.js';

/** Inline SVG line chart of price over time. Needs at least two points to draw. */
function PriceChart({ history, currency }) {
  const points = history.filter((h) => h.price !== null);
  if (points.length < 2) {
    return <p className="muted">Not enough history yet. The chart fills in as the scraper sees price changes.</p>;
  }

  const W = 640, H = 240, PAD_X = 104, PAD_Y = 24;
  const values = points.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => PAD_X + (i * (W - PAD_X * 2)) / (points.length - 1);
  const y = (v) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD_Y} L${x(0).toFixed(1)},${H - PAD_Y} Z`;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price history chart">
      <defs>
        <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={PAD_X} x2={W - PAD_X} y1={PAD_Y} y2={PAD_Y} stroke="var(--border)" strokeDasharray="4 4" />
      <line x1={PAD_X} x2={W - PAD_X} y1={H - PAD_Y} y2={H - PAD_Y} stroke="var(--border)" />
      <text x={PAD_X - 8} y={PAD_Y + 4} textAnchor="end">{money(max, currency)}</text>
      <text x={PAD_X - 8} y={H - PAD_Y + 4} textAnchor="end">{money(min, currency)}</text>
      <path d={area} fill="url(#fade)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i).toFixed(1)} cy={y(p.price).toFixed(1)} r="4" fill="var(--accent)">
          <title>{`${money(p.price, currency)} on ${dateTime(p.recordedAt)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function ProductSkeleton() {
  return (
    <div className="product">
      <div className="skeleton" style={{ aspectRatio: '1 / 1', borderRadius: 16 }} />
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="skeleton" style={{ height: 30, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
      </div>
    </div>
  );
}

function ProductDetails({ p }) {
  const saving = p.old_price && p.price && p.old_price > p.price ? p.old_price - p.price : 0;
  const recent = [...p.history].reverse().slice(0, 12);

  return (
    <>
      <div className="product">
        <div className="product-media">
          {p.image
            ? <SafeImage src={p.image} alt={p.name} />
            : <div style={{ fontSize: 72, opacity: 0.5 }}>🛍️</div>}
        </div>
        <div className="product-info">
          <span className="source-tag">{p.source_name}</span>
          <h1>{p.name}</h1>
          <div><Stars percent={p.rating_percent} rating={p.rating} /></div>
          <div className="price-row" style={{ gap: 12 }}>
            <span className="big-price">{money(p.price, p.currency)}</span>
            {p.old_price ? <s className="old" style={{ fontSize: 16 }}>{money(p.old_price, p.currency)}</s> : null}
            {p.discount_percent ? <span className="badge sale">-{Math.round(p.discount_percent)}%</span> : null}
          </div>
          {saving ? <p className="muted">You save {money(saving, p.currency)} compared with the old price.</p> : null}
          <div className="product-cta">
            {p.url ? <a className="btn" href={p.url} target="_blank" rel="noopener nofollow">View on {p.source_name} ↗</a> : null}
            <Link className="btn ghost" to="/">Back to results</Link>
          </div>
          <div className="panel">
            <dl className="kv">
              <dt>Categories</dt>
              <dd>
                {p.categories.length
                  ? p.categories.map((c) => (
                    <span key={c.slug}>
                      <Link className="badge accent" to={`/?category=${encodeURIComponent(c.slug)}`}>{c.name}</Link>{' '}
                    </span>
                  ))
                  : <span className="muted">None</span>}
              </dd>
              <dt>Last seen</dt><dd>{timeAgo(p.last_seen_at)}</dd>
              <dt>First seen</dt><dd>{dateTime(p.first_seen_at)}</dd>
              <dt>Currency</dt><dd>{p.currency}</dd>
            </dl>
          </div>
        </div>
      </div>

      <section className="stack" style={{ marginTop: 28 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Price history</h2>
            <span className="muted small">{p.history.length} price record{p.history.length === 1 ? '' : 's'}</span>
          </div>
          <PriceChart history={p.history} currency={p.currency} />
        </div>
        <div className="panel">
          <h2>Recent changes</h2>
          <table className="history">
            <thead><tr><th>Date</th><th>Price</th><th>Old price</th></tr></thead>
            <tbody>
              {recent.map((h, i) => (
                <tr key={i}>
                  <td>{dateTime(h.recordedAt)}</td>
                  <td>{money(h.price, p.currency)}</td>
                  <td>{h.oldPrice ? money(h.oldPrice, p.currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function ProductPage() {
  const toast = useToast();
  const { id: routeId } = useParams();
  const [search] = useSearchParams();
  const id = routeId ?? search.get('id'); // the second form is the old /product.html?id=... link

  const { data: p, error } = useResource(
    (signal) => (id
      ? api(`/api/products/${encodeURIComponent(id)}`, { signal })
      : Promise.reject(new Error('No product selected.'))),
    [id],
  );
  useTitle(p ? `${p.name} | PriceRadar` : 'Product | PriceRadar');

  const errorMessage = error ? (error.status === 404 ? 'This product is no longer available.' : error.message) : '';
  useEffect(() => {
    if (errorMessage) toast(errorMessage, 'error');
  }, [errorMessage, toast]);

  return (
    <>
      <SiteHeader link={{ to: '/', label: 'All products' }} />
      <main className="container" style={{ paddingBottom: 60 }}>
        <div className="crumbs">
          {p ? (
            <>
              <Link to="/">Shop</Link> / <Link to={`/?source=${encodeURIComponent(p.source_slug)}`}>{p.source_name}</Link> / {p.name.slice(0, 60)}
            </>
          ) : null}
        </div>
        {errorMessage
          ? <EmptyState icon="🧭" title={errorMessage}><Link className="btn" to="/">Back to PriceRadar</Link></EmptyState>
          : p
            ? <ProductDetails p={p} />
            : <ProductSkeleton />}
      </main>
    </>
  );
}
