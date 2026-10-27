export const $ = (selector, root = document) => root.querySelector(selector);

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const SYMBOLS = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£', NGN: '₦', GHS: 'GH₵', UGX: 'USh', TZS: 'TSh' };

export function money(value, currency = 'KES') {
  if (value === null || value === undefined) return '—';
  return `${SYMBOLS[currency] || currency} ${Math.round(value).toLocaleString('en-US')}`;
}

export function dateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000); // negative means in the past
  const abs = Math.abs(diff);
  if (abs < 60) return diff < 0 ? 'just now' : 'in a moment';
  for (const [size, label] of [[86400, 'day'], [3600, 'hour'], [60, 'minute']]) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      const text = `${n} ${label}${n === 1 ? '' : 's'}`;
      return diff < 0 ? `${text} ago` : `in ${text}`;
    }
  }
  return '';
}

export function formatInterval(minutes) {
  if (minutes % 1440 === 0) return `Every ${minutes / 1440} day${minutes > 1440 ? 's' : ''}`;
  if (minutes % 60 === 0) return `Every ${minutes / 60} h`;
  return `Every ${minutes} min`;
}

export function starsHtml(percent, rating) {
  if (percent === null || percent === undefined) {
    return rating ? `<span class="small muted">★ ${esc(rating)}</span>` : '';
  }
  const width = Math.max(0, Math.min(100, Number(percent)));
  return `<span class="stars" style="--p:${width}%" title="Rated ${rating ?? ''}"></span>`
    + (rating ? ` <span class="small muted">${esc(rating)}</span>` : '');
}

export async function api(path, { method = 'GET', body } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export function toast(message, type = 'ok') {
  const wrap = $('#toasts') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toasts', className: 'toast-wrap' }));
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/** Swaps broken product images for a placeholder. Uses one capture listener on the container. */
export function imageFallback(container) {
  container.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains('thumb-mini')) {
      img.style.visibility = 'hidden';
      return;
    }
    const fallback = document.createElement('div');
    fallback.className = 'img-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = '🛍️';
    img.replaceWith(fallback);
  }, true);
}

export const THEME_ICON = '<svg class="icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

export function debounce(fn, ms = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined && value !== false) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

function safeStorage(action, key, value) {
  try {
    if (action === 'get') return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
  return null;
}

/** Light/dark toggle. Respects the system setting until the user picks one. */
export function initTheme(buttonSelector) {
  const root = document.documentElement;
  const saved = safeStorage('get', 'pr-theme');
  if (saved) root.dataset.theme = saved;

  const button = $(buttonSelector);
  if (!button) return;
  button.addEventListener('click', () => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const current = root.dataset.theme || (systemDark ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    safeStorage('set', 'pr-theme', next);
  });
}
