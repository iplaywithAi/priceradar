import '../styles/app.css';
import { $, api, esc, imageFallback, initTheme, money, dateTime, starsHtml, timeAgo, toast } from '../lib/common.js';

/** Inline SVG line chart of price over time. Needs at least two points to draw. */
function priceChart(history, currency) {
  const points = history.filter((h) => h.price !== null);
  if (points.length < 2) {
    return '<p class="muted">Not enough history yet. The chart fills in as the scraper sees price changes.</p>';
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
  const dots = points.map((p, i) => `
    <circle cx="${x(i).toFixed(1)}" cy="${y(p.price).toFixed(1)}" r="4" fill="var(--accent)">
      <title>${money(p.price, currency)} on ${dateTime(p.recordedAt)}</title>
    </circle>`).join('');

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price history chart">
      <defs>
        <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="var(--accent)" stop-opacity="0.32"/>
          <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${PAD_X}" x2="${W - PAD_X}" y1="${PAD_Y}" y2="${PAD_Y}" stroke="var(--border)" stroke-dasharray="4 4"/>
      <line x1="${PAD_X}" x2="${W - PAD_X}" y1="${H - PAD_Y}" y2="${H - PAD_Y}" stroke="var(--border)"/>
      <text x="${PAD_X - 8}" y="${PAD_Y + 4}" text-anchor="end">${esc(money(max, currency))}</text>
      <text x="${PAD_X - 8}" y="${H - PAD_Y + 4}" text-anchor="end">${esc(money(min, currency))}</text>
      <path d="${area}" fill="url(#fade)"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
}

function render(p) {
  document.title = `${p.name} | PriceRadar`;
  $('#crumbs').innerHTML = `<a href="/">Shop</a> / <a href="/?source=${esc(p.source_slug)}">${esc(p.source_name)}</a> / ${esc(p.name.slice(0, 60))}`;

  const image = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" referrerpolicy="no-referrer">`
    : '<div style="font-size:72px;opacity:.5">🛍️</div>';
  const saving = p.old_price && p.price && p.old_price > p.price ? p.old_price - p.price : 0;
  const categories = p.categories.map((c) => `<a class="badge accent" href="/?category=${esc(c.slug)}">${esc(c.name)}</a>`).join(' ');
  const history = [...p.history].reverse().slice(0, 12);

  $('#content').innerHTML = `
    <div class="product">
      <div class="product-media">${image}</div>
      <div class="product-info">
        <span class="source-tag">${esc(p.source_name)}</span>
        <h1>${esc(p.name)}</h1>
        <div>${starsHtml(p.rating_percent, p.rating)}</div>
        <div class="price-row" style="gap:12px">
          <span class="big-price">${money(p.price, p.currency)}</span>
          ${p.old_price ? `<s class="old" style="font-size:16px">${money(p.old_price, p.currency)}</s>` : ''}
          ${p.discount_percent ? `<span class="badge sale">-${Math.round(p.discount_percent)}%</span>` : ''}
        </div>
        ${saving ? `<p class="muted">You save ${money(saving, p.currency)} compared with the old price.</p>` : ''}
        <div class="product-cta">
          ${p.url ? `<a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener nofollow">View on ${esc(p.source_name)} ↗</a>` : ''}
          <a class="btn ghost" href="/">Back to results</a>
        </div>
        <div class="panel">
          <dl class="kv">
            <dt>Categories</dt><dd>${categories || '<span class="muted">None</span>'}</dd>
            <dt>Last seen</dt><dd>${timeAgo(p.last_seen_at)}</dd>
            <dt>First seen</dt><dd>${dateTime(p.first_seen_at)}</dd>
            <dt>Currency</dt><dd>${esc(p.currency)}</dd>
          </dl>
        </div>
      </div>
    </div>

    <section class="stack" style="margin-top:28px">
      <div class="panel">
        <div class="panel-head"><h2>Price history</h2><span class="muted small">${p.history.length} price record${p.history.length === 1 ? '' : 's'}</span></div>
        ${priceChart(p.history, p.currency)}
      </div>
      <div class="panel">
        <h2>Recent changes</h2>
        <table class="history">
          <thead><tr><th>Date</th><th>Price</th><th>Old price</th></tr></thead>
          <tbody>
            ${history.map((h) => `<tr><td>${dateTime(h.recordedAt)}</td><td>${money(h.price, p.currency)}</td><td>${h.oldPrice ? money(h.oldPrice, p.currency) : '—'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

async function boot() {
  initTheme('#themeToggle');
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return showError('No product selected.');

  try {
    render(await api(`/api/products/${encodeURIComponent(id)}`));
  } catch (err) {
    showError(err.status === 404 ? 'This product is no longer available.' : err.message);
  }
}

function showError(message) {
  $('#content').innerHTML = `<div class="empty"><div class="empty-icon">🧭</div><h1>${esc(message)}</h1>
    <a class="btn" href="/">Back to PriceRadar</a></div>`;
  toast(message, 'error');
}

imageFallback($('#content'));
boot();
