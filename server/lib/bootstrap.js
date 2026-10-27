import { PRESETS } from '../scraper/presets.js';
import { col } from './collections.js';
import { commitOps, nowIso } from './docs.js';

const DEFAULT_CATEGORIES = [
  ['shoes', 'Shoes', 'shoes', '👟'],
  ['electronics', 'Electronics', 'electronics', '🔌'],
  ['clothing', 'Clothing', 'clothes', '👕'],
  ['phones', 'Phones', 'smartphone', '📱'],
  ['laptops', 'Laptops', 'laptop', '💻'],
];

/** Creates the Jumia store and the default categories when the database is empty. */
export async function seedIfEmpty() {
  const [sources, categories] = await Promise.all([col.sources.limit(1).get(), col.categories.limit(1).get()]);
  const createdAt = nowIso();
  const ops = [];

  if (sources.empty) {
    const p = PRESETS.jumia_ke;
    ops.push({
      type: 'set',
      ref: col.sources.doc(p.slug),
      data: {
        name: p.name, slug: p.slug, baseUrl: p.base_url, searchUrlTemplate: p.search_url_template,
        currency: p.currency, selectors: p.selectors, enabled: true, createdAt,
      },
    });
  }
  if (categories.empty) {
    for (const [slug, name, searchTerm, emoji] of DEFAULT_CATEGORIES) {
      ops.push({ type: 'set', ref: col.categories.doc(slug), data: { name, slug, searchTerm, emoji, createdAt } });
    }
  }
  await commitOps(ops);
}

/** A run still marked running means the process stopped mid-scrape. Mark those failed. */
export async function recoverInterruptedRuns() {
  const running = await col.scrapeRuns.where('status', '==', 'running').get();
  await commitOps(running.docs.map((doc) => ({
    type: 'update',
    ref: doc.ref,
    data: { status: 'failed', error: 'Interrupted by server restart', finishedAt: nowIso() },
  })));
}
