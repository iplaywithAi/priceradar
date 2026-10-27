import { db } from './firebase.js';

/**
 * Firestore collections.
 *  sources/{slug}                 a store and its CSS selectors
 *  categories/{slug}              a product group and the search term sent to stores
 *  schedules/{source}__{category} how often a store and category are scraped (one per pair)
 *  products/{source_md5}          one product, with denormalised store and category fields
 *  products/{id}/priceHistory/    one document per first sighting and per price change
 *  scrapeRuns/{autoId}            one document per scrape, with its log
 */
export const col = {
  sources: db.collection('sources'),
  categories: db.collection('categories'),
  schedules: db.collection('schedules'),
  products: db.collection('products'),
  scrapeRuns: db.collection('scrapeRuns'),
};
