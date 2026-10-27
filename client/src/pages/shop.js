import '../styles/app.css';
import { $, api, debounce, esc, imageFallback, initTheme, money, queryString, starsHtml, timeAgo, toast } from '../lib/common.js';

const PER_PAGE = 24;
const DEFAULTS = { q: '', category: '', source: '', minPrice: '', maxPrice: '', onSale: '', sort: 'newest', page: 1 };
const state = { ...DEFAULTS };
let controller = null;

/* ---------- URL state so filtered views can be shared ---------- */

function readUrl() {
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(DEFAULTS)) {
    if (params.has(key)) state[key] = key === 'page' ? Number(params.get(key)) || 1 : params.get(key);
  }
}

function writeUrl() {
  const compact = {};
  for (const [key, value] of Object.entries(state)) {
    if (value !== DEFAULTS[key] && value !== '') compact[key] = value;
  }
  history.replaceState(null, '', `/${queryString(compact)}`);
}

/* ---------- Rendering ---------- */

function renderChips(categories) {
  const total = categories.reduce((sum, c) => sum + c.productCount, 0);
  const chips = [{ slug: '', name: 'All', emoji: '✨', productCount: total }, ...categories];
  $('#categoryChips').innerHTML = chips.map((c) => `
    <button class="chip ${state.category === c.slug ? 'active' : ''}" type="button" role="tab"
            aria-selected="${state.category === c.slug}" data-slug="${esc(c.slug)}">
      <span>${esc(c.emoji || '•')}</span>${esc(c.name)} <small>${c.productCount}</small>
    </button>`).join('');
}

function renderSources(sources) {
  const select = $('#sourceFilter');
  select.innerHTML = '<option value="">All stores</option>' + sources
    .map((s) => `<option value="${esc(s.slug)}">${esc(s.name)} (${s.productCount})</option>`).join('');
  select.value = state.source;
}

function productCard(p) {
  const hasSale = p.discount_percent > 0 || (p.old_price && p.price && p.old_price > p.price);
  const discount = p.discount_percent ? `-${Math.round(p.discount_percent)}%` : '';
  const image = p.image
    ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<div class="placeholder" aria-hidden="true">🛍️</div>';

  return `
    <article class="card">
      <a class="thumb" href="/product.html?id=${p.id}" aria-label="View ${esc(p.name)}">
        ${image}
        ${hasSale && discount ? `<span class="badge sale sale-tag">${esc(discount)}</span>` : ''}
      </a>
      <div class="card-body">
        <span class="source-tag">${esc(p.source_name)}</span>
        <h3 class="card-title"><a href="/product.html?id=${p.id}">${esc(p.name)}</a></h3>
        <div class="price-row">
          <span class="price">${money(p.price, p.currency)}</span>
          ${p.old_price ? `<s class="old">${money(p.old_price, p.currency)}</s>` : ''}
        </div>
        <div>${starsHtml(p.rating_percent, p.rating)}</div>
        <div class="card-foot">
          <a class="btn ghost small-btn" href="/product.html?id=${p.id}">Details</a>
          ${p.url ? `<a class="btn small-btn" href="${esc(p.url)}" target="_blank" rel="noopener nofollow">Store ↗</a>` : ''}
        </div>
      </div>
    </article>`;
}

function renderSkeletons() {
  $('#grid').innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton skeleton-card" aria-hidden="true"></div>').join('');
}

function renderPager(page, pages) {
  const pager = $('#pager');
  if (pages <= 1) { pager.innerHTML = ''; return; }
  pager.innerHTML = `
    <button class="btn ghost small-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Previous</button>
    <span class="muted small">Page ${page} of ${pages}</span>
    <button class="btn ghost small-btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button>`;
}

/* ---------- Data loading ---------- */

async function loadProducts() {
  controller?.abort();
  controller = new AbortController();
  renderSkeletons();

  const params = { limit: PER_PAGE, page: state.page, sort: state.sort, q: state.q, category: state.category,
    source: state.source, minPrice: state.minPrice, maxPrice: state.maxPrice, onSale: state.onSale ? '1' : '' };

  try {
    const data = await api(`/api/products${queryString(params)}`, { signal: controller.signal });
    const from = (data.page - 1) * PER_PAGE + 1;
    // total is null when the search could not count every match (see the server's scan cap).
    let summary;
    if (!data.items.length) {
      summary = 'No products match these filters';
    } else if (data.total === null) {
      const to = from + data.items.length - 1;
      summary = `Showing ${from}–${to} products${data.hasMore ? ', and more' : ''}`;
    } else {
      const to = Math.min(data.page * PER_PAGE, data.total);
      summary = `Showing ${from}–${to} of ${data.total.toLocaleString('en-US')} products`;
    }
    if (data.truncated) summary += '. Narrow the filters to see more.';
    $('#resultText').textContent = summary;

    $('#grid').innerHTML = data.items.length
      ? data.items.map(productCard).join('')
      : `<div class="empty" style="grid-column: 1 / -1">
           <div class="empty-icon">🔎</div>
           <h1>Nothing here yet</h1>
           <p class="muted">Try a different search, clear the price filters, or pick another category.</p>
           <button class="btn ghost" type="button" id="resetFilters">Reset filters</button>
         </div>`;
    renderPager(data.page, data.pages);
  } catch (err) {
    if (err.name === 'AbortError') return;
    $('#grid').innerHTML = '';
    $('#resultText').textContent = 'Could not load products';
    toast(err.message, 'error');
  }
}

async function loadMeta() {
  const [categories, sources, stats] = await Promise.all([
    api('/api/categories'), api('/api/sources'), api('/api/stats'),
  ]);
  renderChips(categories);
  renderSources(sources);
  $('#statRow').innerHTML = `
    <span><strong>${stats.products.toLocaleString('en-US')}</strong>products tracked</span>
    <span><strong>${stats.sources}</strong>stores</span>
    <span><strong>${stats.categories}</strong>categories</span>
    <span>Updated ${timeAgo(stats.lastUpdated)}</span>`;
  $('#footUpdated').textContent = stats.lastUpdated ? `Last refresh ${timeAgo(stats.lastUpdated)}` : '';
}

/* ---------- Events ---------- */

function applyChange(patch, { resetPage = true } = {}) {
  Object.assign(state, patch);
  if (resetPage) state.page = 1;
  writeUrl();
  syncControls();
  loadProducts();
}

function syncControls() {
  $('#qInput').value = state.q;
  $('#minPrice').value = state.minPrice;
  $('#maxPrice').value = state.maxPrice;
  $('#onSale').checked = !!state.onSale;
  $('#sortSelect').value = state.sort;
  $('#sourceFilter').value = state.source;
  document.querySelectorAll('#categoryChips .chip').forEach((chip) => {
    const active = chip.dataset.slug === state.category;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-selected', String(active));
  });
}

function bindEvents() {
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    applyChange({ q: $('#qInput').value.trim() });
  });
  $('#categoryChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) applyChange({ category: chip.dataset.slug });
  });
  $('#sourceFilter').addEventListener('change', (e) => applyChange({ source: e.target.value }));
  $('#sortSelect').addEventListener('change', (e) => applyChange({ sort: e.target.value }));
  $('#onSale').addEventListener('change', (e) => applyChange({ onSale: e.target.checked ? '1' : '' }));

  const onPrice = debounce(() => applyChange({ minPrice: $('#minPrice').value, maxPrice: $('#maxPrice').value }), 450);
  $('#minPrice').addEventListener('input', onPrice);
  $('#maxPrice').addEventListener('input', onPrice);

  $('#pager').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    state.page = Number(btn.dataset.page);
    writeUrl();
    loadProducts();
    window.scrollTo({ top: 260, behavior: 'smooth' });
  });

  $('#grid').addEventListener('click', (e) => {
    if (e.target.closest('#resetFilters')) {
      applyChange({ ...DEFAULTS });
    }
  });
}

/* ---------- Boot ---------- */

initTheme('#themeToggle');
imageFallback($('#grid'));
readUrl();
bindEvents();
syncControls();
loadMeta().catch((err) => toast(`Could not load filters: ${err.message}`, 'error'));
loadProducts();
