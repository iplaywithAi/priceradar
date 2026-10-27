import { db } from './firebase.js';

export const nowIso = () => new Date().toISOString();

/** Firestore rejects undefined values, so they become null before any write. */
export function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  }
  return value === undefined ? null : value;
}

const chunk = (items, size) => {
  const parts = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
};

/** Reads many documents with db.getAll, in groups that stay under Firestore limits. */
export async function getAllDocs(refs) {
  const results = [];
  for (const part of chunk(refs, 300)) results.push(...(await db.getAll(...part)));
  return results;
}

/**
 * Writes a list of operations in batches of 400 (Firestore allows 500 per batch).
 * Each op is { type: 'set' | 'update' | 'delete', ref, data?, options? }.
 */
export async function commitOps(ops) {
  for (const part of chunk(ops, 400)) {
    const batch = db.batch();
    for (const op of part) {
      if (op.type === 'set') batch.set(op.ref, clean(op.data), op.options || {});
      else if (op.type === 'update') batch.update(op.ref, clean(op.data));
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
}
