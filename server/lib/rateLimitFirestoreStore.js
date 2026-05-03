import { Timestamp } from '@google-cloud/firestore';
import { createHash } from 'node:crypto';
import { getSharedFirestore } from './firestoreClient.js';

const COLLECTION = 'api_rate_limits';

function docIdForKey(key) {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

function readWindowStartMs(data) {
  if (!data) return null;
  const ws = data.windowStart;
  if (ws instanceof Timestamp) return ws.toMillis();
  if (typeof data.windowStartMs === 'number') return data.windowStartMs;
  return null;
}

/**
 * Fixed-window counter in Firestore so all Cloud Run instances share the same /api limits.
 * @see https://github.com/express-rate-limit/express-rate-limit#store
 */
export class FirestoreRateLimitStore {
  constructor() {
    /** @type {boolean} Must be false for distributed stores (express-rate-limit) */
    this.localKeys = false;
    this.windowMs = 60_000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  /**
   * @param {string} key
   * @returns {Promise<{ totalHits: number, resetTime: Date }>}
   */
  async increment(key) {
    const db = getSharedFirestore();
    const ref = db.collection(COLLECTION).doc(docIdForKey(key));
    const now = Date.now();
    const windowMs = this.windowMs;

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let totalHits;
      let windowStartMs;
      let resetTime;

      if (!snap.exists) {
        totalHits = 1;
        windowStartMs = now;
        resetTime = new Date(now + windowMs);
      } else {
        const data = snap.data();
        const prevStart = readWindowStartMs(data);
        if (prevStart == null || now - prevStart >= windowMs) {
          totalHits = 1;
          windowStartMs = now;
          resetTime = new Date(now + windowMs);
        } else {
          totalHits = (data.count || 0) + 1;
          windowStartMs = prevStart;
          resetTime = new Date(prevStart + windowMs);
        }
      }

      tx.set(ref, {
        count: totalHits,
        windowStart: Timestamp.fromMillis(windowStartMs),
      });

      return { totalHits, resetTime };
    });
  }

  async decrement(key) {
    const db = getSharedFirestore();
    const ref = db.collection(COLLECTION).doc(docIdForKey(key));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      const next = (data.count || 0) - 1;
      if (next <= 0) {
        tx.delete(ref);
      } else {
        tx.update(ref, { count: next });
      }
    });
  }

  async resetKey(key) {
    const db = getSharedFirestore();
    await db.collection(COLLECTION).doc(docIdForKey(key)).delete();
  }

  async resetAll() {
    const db = getSharedFirestore();
    const ref = db.collection(COLLECTION);
    let snap = await ref.limit(500).get();
    while (!snap.empty) {
      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      snap = await ref.limit(500).get();
    }
  }
}
