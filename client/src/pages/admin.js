import '../styles/app.css';
import { $, api, dateTime, esc, formatInterval, imageFallback, initTheme, money, queryString, timeAgo, toast } from '../lib/common.js';

const INTERVAL_PRESETS = [
  [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [180, '3 hours'],
  [360, '6 hours'], [720, '12 hours'], [1440, '24 hours'],
];
const SELECTOR_FIELDS = [
  ['item', 'Product card (container)', true],
  ['name', 'Product name', true],
  ['price', 'Current price', false],
  ['oldPrice', 'Old price', false],
  ['discount', 'Discount badge', false],
  ['rating', 'Rating element', false],
  ['link', 'Product link (a tag)', false],
  ['image', 'Product image', false],
];

const lookups = { sources: [], categories: [], presets: [] };
const productFilters = { q: '', source: '', category: '', visibility: '', page: 1 };
let runsStatus = '';
let pollTimer = null;
let wasRunning = false;

const view = () => $('#view');

/** One listener per event type on the view container, replaced on each render so nothing stacks up. */
const viewListeners = {};
function bindView(type, handler) {
  const container = view();
  if (viewListeners[type]) container.removeEventListener(type, viewListeners[type]);
  viewListeners[type] = handler;
  container.addEventListener(type, handler);
}
const currentRoute = () => (location.hash.replace('#/', '') || 'dashboard');

/* ---------- Request wrapper: a 401 sends the admin back to sign in ---------- */

async function request(path, options) {
  try {
    return await api(path, options);
  } catch (err) {
    if (err.status === 401) {
      stopPolling();
      showLogin();
      toast('Your session has ended. Please sign in again.', 'error');
    }
    throw err;
  }
}

/* ---------- Small UI helpers ---------- */

const pageHead = (title, subtitle, actions = '') => `
  <div class="page-head">
    <div><h1>${title}</h1><p>${subtitle}</p></div>
    <div class="actions">${actions}</div>
  </div>`;

const emptyState = (icon, title, text, action = '') => `
  <div class="empty panel">
    <div class="empty-icon">${icon}</div>
    <h1>${title}</h1>
    <p class="muted" style="margin-top:6px">${text}</p>
    ${action}
  </div>`;

const statusBadge = (status) => {
  const map = { success: ['ok', 'Success'], failed: ['fail', 'Failed'], running: ['run', 'Running'] };
  const [cls, label] = map[status] || ['', status || 'Never run'];
  return `<span class="badge ${cls}">${label}</span>`;
};

function duration(start, end) {
  if (!end) return '—';
  const seconds = Math.round((new Date(end) - new Date(start)) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const sourceOptions = (selected) => lookups.sources
  .map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
const categoryOptions = (selected) => lookups.categories
  .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.emoji || '')} ${esc(c.name)}</option>`).join('');

async function loadLookups() {
  const [sources, categories, presets] = await Promise.all([
    request('/api/admin/sources'), request('/api/admin/categories'), request('/api/admin/presets'),
  ]);
  Object.assign(lookups, { sources, categories, presets });
}

/* ---------- Dialog forms ---------- */

function openDialog({ title, body, submitLabel = 'Save', onSubmit, onOpen }) {
  const dialog = $('#modal');
  dialog.innerHTML = `
    <form method="dialog">
      <h2>${esc(title)}</h2>
      ${body}
      <div class="form-error" id="form-error" role="alert"></div>
      <div class="form-actions">
        <button class="btn ghost" type="button" data-cancel>Cancel</button>
        <button class="btn" type="submit">${esc(submitLabel)}</button>
      </div>
    </form>`;
  const form = dialog.querySelector('form');
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await onSubmit(new FormData(form), form);
      dialog.close();
      toast('Saved');
      await loadLookups();
      route();
    } catch (err) {
      $('#form-error', dialog).textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });
  onOpen?.(form);
  dialog.showModal();
}

function sourceDialog(source = null) {
  const presetPicker = source ? '' : `
    <label class="field full">Start from
      <select name="preset">
        ${lookups.presets.map((p) => `<option value="${esc(p.key)}">${esc(p.label)}</option>`).join('')}
      </select>
    </label>`;

  const selectorInputs = SELECTOR_FIELDS.map(([key, label, required]) => `
    <label class="field">${label}${required ? ' *' : ''}
      <input name="sel_${key}" ${required ? 'required' : ''} placeholder="${key === 'link' ? 'a' : ''}">
    </label>`).join('');

  const body = `
    ${presetPicker}
    <div class="form-grid">
      <label class="field">Store name *<input name="name" required maxlength="80"></label>
      <label class="field">Currency code *<input name="currency" required maxlength="3" style="text-transform:uppercase"></label>
      <label class="field full">Base URL *<input name="baseUrl" type="url" required placeholder="https://www.example.com"></label>
      <label class="field full">Search URL template *
        <input name="searchUrlTemplate" required placeholder="https://www.example.com/search?q={query}&page={page}">
        <span class="hint-text">{query} is replaced by the category search term. {page} is replaced by the page number.</span>
      </label>
      <details class="selectors full" open>
        <summary>CSS selectors</summary>
        <p class="hint-text" style="margin:8px 0 12px">In Chrome, right click a product, choose Inspect, then copy the selector for each part. Leave optional ones blank if the site does not show them.</p>
        <div class="form-grid">${selectorInputs}</div>
      </details>
      <label class="check full"><input type="checkbox" name="enabled" ${!source || source.enabled ? 'checked' : ''}> Enabled</label>
    </div>`;

  openDialog({
    title: source ? `Edit ${source.name}` : 'Add a store',
    body,
    submitLabel: source ? 'Save changes' : 'Add store',
    onOpen(form) {
      const fill = (values) => {
        form.elements.name.value = values.name ?? '';
        form.elements.currency.value = values.currency ?? 'KES';
        form.elements.baseUrl.value = values.base_url ?? values.baseUrl ?? '';
        form.elements.searchUrlTemplate.value = values.search_url_template ?? values.searchUrlTemplate ?? '';
        for (const [key] of SELECTOR_FIELDS) form.elements[`sel_${key}`].value = values.selectors?.[key] ?? '';
      };
      if (source) {
        fill(source);
      } else {
        const presetSelect = form.elements.preset;
        fill(lookups.presets[0] ?? {});
        presetSelect.addEventListener('change', () => {
          fill(lookups.presets.find((p) => p.key === presetSelect.value) ?? {});
        });
      }
    },
    onSubmit: async (fd) => {
      const selectors = {};
      for (const [key] of SELECTOR_FIELDS) selectors[key] = String(fd.get(`sel_${key}`) || '').trim();
      const payload = {
        name: fd.get('name'),
        baseUrl: fd.get('baseUrl'),
        searchUrlTemplate: fd.get('searchUrlTemplate'),
        currency: fd.get('currency'),
        enabled: fd.has('enabled'),
        selectors,
      };
      return source
        ? request(`/api/admin/sources/${source.id}`, { method: 'PUT', body: payload })
        : request('/api/admin/sources', { method: 'POST', body: payload });
    },
  });
}

function categoryDialog(category = null) {
  openDialog({
    title: category ? `Edit ${category.name}` : 'New category',
    body: `
      <div class="form-grid">
        <label class="field">Name *<input name="name" required maxlength="60" value="${esc(category?.name ?? '')}"></label>
        <label class="field">Icon (emoji)<input name="emoji" maxlength="8" value="${esc(category?.emoji ?? '')}"></label>
        <label class="field full">Search term *
          <input name="searchTerm" required maxlength="120" value="${esc(category?.searchTerm ?? '')}" placeholder="e.g. sneakers">
          <span class="hint-text">The word sent to each store's search. Changing it affects future scrapes only.</span>
        </label>
      </div>`,
    onSubmit: async (fd) => {
      const payload = { name: fd.get('name'), searchTerm: fd.get('searchTerm'), emoji: fd.get('emoji') };
      return category
        ? request(`/api/admin/categories/${category.id}`, { method: 'PUT', body: payload })
        : request('/api/admin/categories', { method: 'POST', body: payload });
    },
  });
}

function scheduleDialog(schedule = null) {
  const presetValues = INTERVAL_PRESETS.map(([m]) => m);
  const current = schedule?.intervalMinutes ?? 360;
  const isCustom = !presetValues.includes(current);

  openDialog({
    title: schedule ? 'Edit schedule' : 'New schedule',
    body: `
      <div class="form-grid">
        <label class="field">Store *<select name="sourceId" required>${sourceOptions(schedule?.sourceId)}</select></label>
        <label class="field">Category *<select name="categoryId" required>${categoryOptions(schedule?.categoryId)}</select></label>
        <label class="field">Run every<select name="intervalPreset">
          ${INTERVAL_PRESETS.map(([m, label]) => `<option value="${m}" ${!isCustom && m === current ? 'selected' : ''}>${label}</option>`).join('')}
          <option value="custom" ${isCustom ? 'selected' : ''}>Custom minutes</option>
        </select></label>
        <label class="field" data-custom-interval ${isCustom ? '' : 'hidden'}>Minutes (5 to 10080)
          <input name="customInterval" type="number" min="5" max="10080" value="${isCustom ? current : ''}">
        </label>
        <label class="field">Search pages per run *
          <input name="maxPages" type="number" min="1" max="50" required value="${schedule?.maxPages ?? 3}">
        </label>
        <label class="check" style="align-self:end"><input type="checkbox" name="enabled" ${!schedule || schedule.enabled ? 'checked' : ''}> Enabled</label>
      </div>
      <p class="hint-text">The first run starts on the next scheduler check. After that it repeats on the interval you choose.</p>`,
    submitLabel: schedule ? 'Save schedule' : 'Create schedule',
    onOpen(form) {
      const preset = form.elements.intervalPreset;
      const customWrap = form.querySelector('[data-custom-interval]');
      const syncCustom = () => {
        const custom = preset.value === 'custom';
        customWrap.hidden = !custom;
        form.elements.customInterval.required = custom;
      };
      preset.addEventListener('change', syncCustom);
      syncCustom();
    },
    onSubmit: async (fd) => {
      const intervalMinutes = fd.get('intervalPreset') === 'custom'
        ? Number(fd.get('customInterval'))
        : Number(fd.get('intervalPreset'));
      const payload = {
        sourceId: fd.get('sourceId'),
        categoryId: fd.get('categoryId'),
        maxPages: Number(fd.get('maxPages')),
        intervalMinutes,
        enabled: fd.has('enabled'),
      };
      return schedule
        ? request(`/api/admin/schedules/${schedule.id}`, { method: 'PUT', body: payload })
        : request('/api/admin/schedules', { method: 'POST', body: payload });
    },
  });
}

/* ---------- Views ---------- */

function statCard(label, value, hint = '') {
  return `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

function runsTable(runs, { compact = false } = {}) {
  if (!runs.length) return emptyState('🧾', 'No runs yet', 'Start a scrape or wait for a schedule to run.');
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>Started</th><th>Store</th><th>Category</th>
          ${compact ? '' : '<th>Trigger</th>'}
          <th>Status</th><th>Found</th>
          ${compact ? '' : '<th>New</th><th>Price changes</th><th>Duration</th>'}
        </tr></thead>
        <tbody>
          ${runs.map((r) => `
            <tr class="${compact ? '' : 'clickable'}" ${compact ? '' : `data-run="${r.id}"`}>
              <td>${dateTime(r.startedAt)}</td>
              <td>${esc(r.sourceName)}</td>
              <td>${esc(r.categoryName)}</td>
              ${compact ? '' : `<td><span class="badge">${esc(r.trigger)}</span></td>`}
              <td>${statusBadge(r.status)}${r.error ? `<div class="error-text small">${esc(r.error.slice(0, 140))}</div>` : ''}</td>
              <td class="num">${r.productsFound}</td>
              ${compact ? '' : `<td class="num">${r.productsNew}</td><td class="num">${r.productsChanged}</td><td>${duration(r.startedAt, r.finishedAt)}</td>`}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderLive(scheduler) {
  const box = $('#live-box');
  if (!box) return;
  const running = scheduler.running;
  box.innerHTML = `
    <div class="panel-head"><h2>Live scraper status</h2></div>
    ${running
      ? `<p><span class="badge run">Running</span> <strong>${esc(running.label)}</strong></p>
         <p class="small muted" style="margin-top:6px">Started ${timeAgo(running.startedAt)} (${running.trigger})</p>`
      : '<p><span class="badge ok">Idle</span> No scrape is running right now.</p>'}
    <h3 style="font-size:14px;margin:18px 0 8px">Waiting in queue (${scheduler.queued.length})</h3>
    ${scheduler.queued.length
      ? `<ul style="margin:0;padding-left:18px">${scheduler.queued.map((j) => `<li>${esc(j.label)} <span class="muted small">(${esc(j.trigger)})</span></li>`).join('')}</ul>`
      : '<p class="muted small">Nothing waiting.</p>'}
    <p class="hint-text" style="margin-top:18px">Due schedules are queued automatically. Only one scrape runs at a time so the browser stays light.</p>`;
}

async function renderDashboard() {
  const [stats, runs] = await Promise.all([request('/api/admin/stats'), request('/api/admin/runs?limit=8')]);
  wasRunning = !!stats.scheduler.running;
  view().innerHTML = `
    ${pageHead('Dashboard', 'Scraping activity and the product database at a glance.', '<a class="btn ghost" href="/" target="_blank">Open shop ↗</a>')}
    <div class="stat-grid">
      ${statCard('Products', stats.products.toLocaleString('en-US'), `${stats.hiddenProducts} hidden`)}
      ${statCard('Stores', stats.sources, 'Configured sources')}
      ${statCard('Categories', stats.categories)}
      ${statCard('Active schedules', stats.activeSchedules, 'Running on their own interval')}
      ${statCard('Runs, last 24h', stats.runs24h)}
      ${statCard('Failures, last 24h', stats.failures24h, stats.failures24h ? 'Open run history to see why' : 'All clear')}
    </div>
    <div class="two-col">
      <div class="stack">
        <section class="panel">
          <div class="panel-head"><h2>Run a scrape now</h2></div>
          <form id="quick-run" class="form-grid">
            <label class="field">Store<select name="sourceId" required>${sourceOptions()}</select></label>
            <label class="field">Category<select name="categoryId" required>${categoryOptions()}</select></label>
            <label class="field">Pages<input name="maxPages" type="number" min="1" max="50" value="3" required></label>
            <div style="display:flex;align-items:flex-end"><button class="btn" type="submit">Start scrape</button></div>
          </form>
          <p class="hint-text" style="margin-top:10px">A one-off run. It joins the queue if another scrape is already running.</p>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Recent runs</h2><a href="#/runs">View all →</a></div>
          ${runsTable(runs, { compact: true })}
        </section>
      </div>
      <section class="panel" id="live-box"></section>
    </div>`;

  renderLive(stats.scheduler);
  $('#quick-run').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    try {
      await request('/api/admin/scrape', {
        method: 'POST',
        body: { sourceId: fd.get('sourceId'), categoryId: fd.get('categoryId'), maxPages: Number(fd.get('maxPages')) },
      });
      toast('Scrape queued');
      setTimeout(route, 600);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function renderSchedules() {
  const rows = await request('/api/admin/schedules');
  const byId = new Map(rows.map((r) => [r.id, r]));
  view().innerHTML = `
    ${pageHead('Schedules', 'Set how often each store and category is scraped. Each run visits the number of search pages you choose.',
      '<button class="btn" type="button" data-add-schedule>+ New schedule</button>')}
    ${rows.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Store</th><th>Category</th><th>Frequency</th><th>Pages</th>
            <th>Next run</th><th>Last run</th><th>Last result</th><th>On</th><th></th>
          </tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td><strong>${esc(r.sourceName)}</strong></td>
                <td>${esc(r.categoryEmoji || '')} ${esc(r.categoryName)}</td>
                <td>${formatInterval(r.intervalMinutes)}</td>
                <td class="num">${r.maxPages}</td>
                <td>${r.enabled && r.nextRunAt ? timeAgo(r.nextRunAt) : '<span class="muted">Paused</span>'}</td>
                <td>${timeAgo(r.lastRunAt)}</td>
                <td>${statusBadge(r.lastStatus)}</td>
                <td>
                  <label class="switch" title="Enable or pause">
                    <input type="checkbox" data-toggle="${r.id}" ${r.enabled ? 'checked' : ''}><span></span>
                  </label>
                </td>
                <td style="white-space:nowrap">
                  <button class="btn small-btn ghost" type="button" data-run="${r.id}">Run now</button>
                  <button class="btn small-btn ghost" type="button" data-edit="${r.id}">Edit</button>
                  <button class="btn small-btn ghost" type="button" data-delete="${r.id}" style="color:var(--bad)">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`
      : emptyState('⏱️', 'No schedules yet', 'Create one to scrape a category from a store automatically.',
        '<button class="btn" type="button" data-add-schedule style="margin:16px auto 0">+ New schedule</button>')}`;

  bindView('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-add-schedule')) return scheduleDialog();
    const id = target.dataset.run ?? target.dataset.edit ?? target.dataset.delete;
    if (!id || !byId.has(id)) return;
    if ('run' in target.dataset) {
      try {
        await request(`/api/admin/schedules/${id}/run`, { method: 'POST', body: {} });
        toast('Queued. Watch the live status on the dashboard.');
        setTimeout(route, 500);
      } catch (err) { toast(err.message, 'error'); }
    }
    if ('edit' in target.dataset) scheduleDialog(byId.get(id));
    if ('delete' in target.dataset && confirm('Delete this schedule? Past run history is kept.')) {
      try {
        await request(`/api/admin/schedules/${id}`, { method: 'DELETE' });
        toast('Schedule deleted');
        route();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  bindView('change', async (event) => {
    const toggle = event.target.closest('input[data-toggle]');
    if (!toggle) return;
    const row = byId.get(toggle.dataset.toggle);
    try {
      await request(`/api/admin/schedules/${row.id}`, {
        method: 'PUT',
        body: { sourceId: row.sourceId, categoryId: row.categoryId, maxPages: row.maxPages,
                intervalMinutes: row.intervalMinutes, enabled: toggle.checked },
      });
      toast(toggle.checked ? 'Schedule resumed' : 'Schedule paused');
      route();
    } catch (err) {
      toast(err.message, 'error');
      toggle.checked = !toggle.checked;
    }
  });
}

async function renderSources() {
  const rows = await request('/api/admin/sources');
  const byId = new Map(rows.map((s) => [s.id, s]));
  view().innerHTML = pageHead('Stores', 'Websites PriceRadar scrapes. Each store needs a search URL and CSS selectors for its product cards.',
    '<button class="btn" type="button" data-add-source>+ Add store</button>')
    + (rows.length ? `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Store</th><th>Currency</th><th>Products</th><th>Item selector</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map((s) => `
            <tr>
              <td><strong>${esc(s.name)}</strong><div class="small muted"><a href="${esc(s.baseUrl)}" target="_blank" rel="noopener">${esc(s.baseUrl)}</a></div></td>
              <td>${esc(s.currency)}</td>
              <td class="num">${s.productCount}</td>
              <td><code class="small">${esc(s.selectors.item)}</code></td>
              <td>${s.enabled ? '<span class="badge ok">Enabled</span>' : '<span class="badge">Disabled</span>'}</td>
              <td style="white-space:nowrap">
                <button class="btn small-btn ghost" type="button" data-edit="${s.id}">Edit</button>
                <button class="btn small-btn ghost" type="button" data-delete="${s.id}" style="color:var(--bad)">Delete</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : emptyState('🏬', 'No stores yet', 'Add a store to start scraping.'));

  bindView('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-add-source')) return sourceDialog();
    const id = target.dataset.edit ?? target.dataset.delete;
    if (!byId.has(id)) return;
    if ('edit' in target.dataset) return sourceDialog(byId.get(id));
    if (confirm(`Delete ${byId.get(id).name}? Its schedules and products will be removed too.`)) {
      try {
        await request(`/api/admin/sources/${id}`, { method: 'DELETE' });
        toast('Store deleted');
        await loadLookups();
        route();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
}

async function renderCategories() {
  const rows = await request('/api/admin/categories');
  const byId = new Map(rows.map((c) => [c.id, c]));
  view().innerHTML = pageHead('Categories', 'Product groups for the shop. The search term is what gets typed into each store.',
    '<button class="btn" type="button" data-add-category>+ New category</button>')
    + (rows.length ? `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Category</th><th>Search term</th><th>Products</th><th></th></tr></thead>
        <tbody>
          ${rows.map((c) => `
            <tr>
              <td><strong>${esc(c.emoji || '')} ${esc(c.name)}</strong></td>
              <td><code>${esc(c.searchTerm)}</code></td>
              <td class="num">${c.productCount}</td>
              <td style="white-space:nowrap">
                <button class="btn small-btn ghost" type="button" data-edit="${c.id}">Edit</button>
                <button class="btn small-btn ghost" type="button" data-delete="${c.id}" style="color:var(--bad)">Delete</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : emptyState('🏷️', 'No categories yet', 'Create one, such as Shoes or Electronics.'));

  bindView('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.hasAttribute('data-add-category')) return categoryDialog();
    const id = target.dataset.edit ?? target.dataset.delete;
    if (!byId.has(id)) return;
    if ('edit' in target.dataset) return categoryDialog(byId.get(id));
    if (confirm(`Delete the category "${byId.get(id).name}"? Its schedules are removed too.`)) {
      try {
        await request(`/api/admin/categories/${id}`, { method: 'DELETE' });
        toast('Category deleted');
        await loadLookups();
        route();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
}

async function renderProducts() {
  const f = productFilters;
  const hidden = f.visibility === 'hidden' ? 1 : f.visibility === 'visible' ? 0 : '';
  const params = { limit: 25, page: f.page, q: f.q, source: f.source, category: f.category, hidden };
  const exportParams = { q: f.q, source: f.source, category: f.category };
  const data = await request(`/api/admin/products${queryString(params)}`);
  // total is null when the search could not count every match. Then Next depends on hasMore.
  const countText = data.total === null ? 'Many' : data.total.toLocaleString('en-US');
  const hasNext = data.total === null ? data.hasMore : data.page < data.pages;

  view().innerHTML = `
    ${pageHead('Products', `${countText} products match. Hidden products stay in the database but are not shown on the shop.${data.truncated ? ' The search checks a limited number of products, so narrow the filters for complete results.' : ''}`,
      `<a class="btn ghost" href="/api/admin/export.csv${queryString(exportParams)}">Export CSV</a>`)}
    <form class="toolbar-inline" id="product-filters">
      <input class="wide" name="q" type="search" value="${esc(f.q)}" placeholder="Search by name">
      <select name="source"><option value="">All stores</option>${lookups.sources.map((s) => `<option value="${esc(s.slug)}" ${f.source === s.slug ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <select name="category"><option value="">All categories</option>${lookups.categories.map((c) => `<option value="${esc(c.slug)}" ${f.category === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select name="visibility">
        <option value="" ${f.visibility === '' ? 'selected' : ''}>All</option>
        <option value="visible" ${f.visibility === 'visible' ? 'selected' : ''}>Visible only</option>
        <option value="hidden" ${f.visibility === 'hidden' ? 'selected' : ''}>Hidden only</option>
      </select>
      <button class="btn small-btn" type="submit">Apply</button>
    </form>
    ${data.items.length ? `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Product</th><th>Store</th><th>Categories</th><th>Price</th><th>Discount</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${data.items.map((p) => `
            <tr>
              <td><div style="display:flex;gap:10px;align-items:center">
                ${p.image ? `<img class="thumb-mini" src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb-mini"></div>'}
                <div class="name-cell" title="${esc(p.name)}">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</div>
              </div></td>
              <td>${esc(p.sourceName)}</td>
              <td class="small">${esc(p.categories || '—')}</td>
              <td class="num">${money(p.price, p.currency)}${p.oldPrice ? `<div class="small muted"><s>${money(p.oldPrice, p.currency)}</s></div>` : ''}</td>
              <td>${p.discount ? `-${Math.round(p.discount)}%` : '—'}</td>
              <td>${timeAgo(p.lastSeenAt)}</td>
              <td>${p.hidden ? '<span class="badge">Hidden</span>' : '<span class="badge ok">Visible</span>'}</td>
              <td style="white-space:nowrap">
                <button class="btn small-btn ghost" type="button" data-hide="${p.id}" data-hidden="${p.hidden ? 1 : 0}">${p.hidden ? 'Show' : 'Hide'}</button>
                <button class="btn small-btn ghost" type="button" data-remove="${p.id}" style="color:var(--bad)">Delete</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="pager-inline">
        <button class="btn small-btn ghost" type="button" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>← Prev</button>
        <span>Page ${data.page}${data.total === null ? '' : ` of ${data.pages}`}</span>
        <button class="btn small-btn ghost" type="button" data-page="${data.page + 1}" ${hasNext ? '' : 'disabled'}>Next →</button>
      </div>`
      : emptyState('📦', 'No products found', 'Run a scrape, or clear the filters.')}`;

  $('#product-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    Object.assign(productFilters, { q: String(fd.get('q') || '').trim(), source: fd.get('source'), category: fd.get('category'), visibility: fd.get('visibility'), page: 1 });
    route();
  });
  bindView('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.page) {
      productFilters.page = Number(target.dataset.page);
      return route();
    }
    if (target.dataset.hide) {
      const hide = target.dataset.hidden !== '1';
      await request(`/api/admin/products/${target.dataset.hide}`, { method: 'PATCH', body: { hidden: hide } })
        .then(() => { toast(hide ? 'Hidden from the shop' : 'Visible on the shop'); route(); })
        .catch((err) => toast(err.message, 'error'));
    }
    if (target.dataset.remove && confirm('Delete this product from the database? The next scrape may add it back. Use Hide to keep it off the shop.')) {
      await request(`/api/admin/products/${target.dataset.remove}`, { method: 'DELETE' })
        .then(() => { toast('Product deleted'); route(); })
        .catch((err) => toast(err.message, 'error'));
    }
  });
}

async function renderRuns() {
  const runs = await request(`/api/admin/runs?limit=100${runsStatus ? `&status=${runsStatus}` : ''}`);
  view().innerHTML = `
    ${pageHead('Run history', 'Every scrape, scheduled or manual. Click a run to read its log.',
      `<select id="runs-status" style="width:auto">
         <option value="">All statuses</option>
         ${['success', 'failed', 'running'].map((s) => `<option value="${s}" ${runsStatus === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
       </select>`)}
    ${runsTable(runs)}`;

  $('#runs-status').addEventListener('change', (event) => {
    runsStatus = event.target.value;
    route();
  });
  bindView('click', async (event) => {
    const row = event.target.closest('tr[data-run]');
    if (!row) return;
    const existing = row.nextElementSibling;
    if (existing?.classList.contains('sub-row')) {
      existing.remove();
      row.classList.remove('open');
      return;
    }
    row.classList.add('open');
    const run = await request(`/api/admin/runs/${row.dataset.run}`);
    const detail = document.createElement('tr');
    detail.className = 'sub-row';
    detail.innerHTML = `<td colspan="9">
      <div class="small muted" style="margin-bottom:8px">Pages scraped: ${run.pagesScraped} ·
        Finished: ${dateTime(run.finishedAt)}${run.error ? ` · <span class="error-text">${esc(run.error)}</span>` : ''}</div>
      <pre class="log">${esc(run.log || 'No log was recorded for this run.')}</pre></td>`;
    row.after(detail);
  });
}

/* ---------- Router and live status ---------- */

const ROUTES = {
  dashboard: renderDashboard,
  schedules: renderSchedules,
  sources: renderSources,
  categories: renderCategories,
  products: renderProducts,
  runs: renderRuns,
};

function route() {
  const name = ROUTES[currentRoute()] ? currentRoute() : 'dashboard';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  view().innerHTML = '<div class="skeleton" style="height:240px;border-radius:16px"></div>';
  ROUTES[name]().catch((err) => {
    if (err.status !== 401) view().innerHTML = emptyState('⚠️', 'Could not load this page', esc(err.message));
  });
}

async function poll() {
  try {
    const stats = await request('/api/admin/stats');
    const s = stats.scheduler;
    $('#scheduler-status').innerHTML = s.running
      ? `<span class="badge run">Scraping</span> ${esc(s.running.label)}`
      : `<span class="badge ok">Idle</span>${s.queued.length ? ` · ${s.queued.length} queued` : ''}`;
    if (currentRoute() === 'dashboard') renderLive(s);
    // When a run finishes, refresh the table so its result shows up.
    if (wasRunning && !s.running) route();
    wasRunning = !!s.running;
  } catch {
    /* ignore transient failures, the next poll retries */
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(poll, 8000);
  poll();
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function showLogin() {
  $('#app-view').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
}

async function showApp() {
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  await loadLookups();
  route();
  startPolling();
}

/* ---------- Boot ---------- */

initTheme('#themeToggle');
imageFallback(view());
window.addEventListener('hashchange', route);

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const fd = new FormData(event.target);
  $('#login-error').textContent = '';
  try {
    await api('/api/admin/login', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password') } });
    event.target.reset();
    await showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
  stopPolling();
  showLogin();
});

try {
  await api('/api/admin/session');
  await showApp();
} catch {
  showLogin();
}
