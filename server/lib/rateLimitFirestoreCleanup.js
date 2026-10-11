import { Timestamp } from '@google-cloud/firestore';
import { getSharedFirestore } from './firestoreClient.js';
import { RATE_LIMIT_FIRESTORE_COLLECTION } from './rateLimitFirestoreStore.js';

const BATCH_SIZE = 500;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60_000;

/**
 * Delete rate-limit docs whose `expireAt` is in the past (see rateLimitFirestoreStore).
 * @param {{ maxBatches?: number }} options — cap work per run (500 docs × maxBatches)
 * @returns {Promise<number>} documents deleted
 */
export async function deleteExpiredRateLimitDocs({ maxBatches = 40 } = {}) {
  const db = getSharedFirestore();
  const now = Timestamp.now();
  let totalDeleted = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const snap = await db
      .collection(RATE_LIMIT_FIRESTORE_COLLECTION)
      .where('expireAt', '<=', now)
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += snap.size;

    if (snap.size < BATCH_SIZE) break;
  }

  return totalDeleted;
}

let startupTimer;
let intervalTimer;
let cleanupStarted;

/** Runs on each Cloud Run instance when Firestore rate limits are enabled (idempotent deletes). */
export function startRateLimitFirestoreCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;

  if (String(process.env.RATE_LIMIT_CLEANUP_ENABLED ?? '1').trim() === '0') {
    console.log('[rate-limit-firestore] periodic cleanup disabled (RATE_LIMIT_CLEANUP_ENABLED=0)');
    return;
  }

  const parsed = parseInt(String(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS ?? ''), 10);
  const intervalMs =
    Number.isFinite(parsed) && parsed >= 60_000 ? parsed : DEFAULT_INTERVAL_MS;

  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const deleted = await deleteExpiredRateLimitDocs();
      if (deleted > 0) {
        console.log('[rate-limit-firestore] cleanup removed %s expired document(s)', deleted);
      }
    } catch (err) {
      console.error('[rate-limit-firestore] cleanup failed:', err?.code || err?.message || err);
    } finally {
      running = false;
    }
  };

  startupTimer = setTimeout(() => {
    run();
    intervalTimer = setInterval(run, intervalMs);
  }, STARTUP_DELAY_MS);

  console.log(
    '[rate-limit-firestore] periodic cleanup scheduled — field expireAt, every %s ms',
    intervalMs,
  );
}

export function stopRateLimitFirestoreCleanup() {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = undefined;
  }
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = undefined;
  }
  cleanupStarted = false;
}
