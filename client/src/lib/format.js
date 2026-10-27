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

export function duration(start, end) {
  if (!end) return '—';
  const seconds = Math.round((new Date(end) - new Date(start)) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined && value !== false) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
