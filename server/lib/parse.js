import { createHash } from 'node:crypto';

/** "KSh 2,499.00" -> 2499 */
export function parseMoney(text) {
  if (!text) return null;
  const match = String(text).replace(/ /g, ' ').match(/\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/** "-38%" -> 38 */
export function parsePercent(text) {
  if (!text) return null;
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

/** "4.5 out of 5" -> 4.5 (capped at 5) */
export function parseRating(text) {
  if (!text) return null;
  const match = String(text).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return value <= 5 ? value : null;
}

export function cleanText(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

/** Absolute http(s) URL, or null. Rejects data:, javascript: and other schemes from scraped pages. */
export function absoluteUrl(value, base) {
  if (!value) return null;
  try {
    const u = new URL(String(value).trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

const TRACKING_PARAMS = new Set(['ref', 'srsltid', 'src', 'source', 'gclid', 'fbclid', 'mc_cid', 'mc_eid']);

/** Product URL without tracking parameters or hash, so the same product always gets the same link. */
export function cleanUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
    }
    return u.href;
  } catch {
    return null;
  }
}

/** Stable product key derived from the cleaned URL, falling back to the name. */
export function productKey(url, name) {
  return createHash('md5').update(url || name).digest('hex');
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Firestore document ID for a product: store slug plus a hash of its canonical URL. */
export function productDocId(sourceSlug, externalId) {
  return `${sourceSlug}_${externalId}`;
}
