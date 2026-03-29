import { Router } from 'express';
import { Firestore, Timestamp } from '@google-cloud/firestore';

const router = Router();

// Initialise Firestore once — uses ADC on Cloud Run, GOOGLE_APPLICATION_CREDENTIALS locally
let db;
function getDb() {
  if (!db) {
    db = new Firestore({
      projectId: process.env.GCLOUD_PROJECT || undefined,
      databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
    });
    console.log('[share] Firestore init — project:', process.env.GCLOUD_PROJECT || '(auto)', 'db:', process.env.FIRESTORE_DATABASE_ID || '(default)');
  }
  return db;
}

const COLLECTION = 'shared_graphs';

function makeId(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < len; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// POST /api/share
// Body: { id?, topic, graphData, rootLabel, expandedNodes, parentLabelOf, originalPosition }
// If id is provided, upserts that document (stable link). Otherwise creates a new one.
// Returns: { id }
router.post('/', async (req, res) => {
  const { id: existingId, topic, graphData, rootLabel, expandedNodes, parentLabelOf, originalPosition } = req.body;

  if (!graphData?.nodes?.length) {
    return res.status(400).json({ error: 'graphData with nodes is required' });
  }

  if (existingId && !/^[a-z0-9]{8}$/.test(existingId)) {
    return res.status(400).json({ error: 'Invalid share ID' });
  }

  try {
    const firestore = getDb();

    let id = existingId;
    if (!id) {
      // Brand-new share — generate a unique ID (retry once on collision)
      id = makeId();
      const existing = await firestore.collection(COLLECTION).doc(id).get();
      if (existing.exists) id = makeId();
    }

    await firestore.collection(COLLECTION).doc(id).set({
      id,
      topic: topic || '',
      graphData,
      rootLabel: rootLabel || '',
      expandedNodes: expandedNodes || [],
      // Store Maps as plain objects — Firestore forbids nested arrays
      parentLabelOf: Object.fromEntries(parentLabelOf || []),
      originalPosition: Object.fromEntries(originalPosition || []),
      createdAt: Timestamp.now(),
    });

    res.json({ id });
  } catch (err) {
    console.error('[share POST] error:', err.message);
    console.error('[share POST] code:', err.code);
    console.error('[share POST] stack:', err.stack);
    res.status(500).json({ error: 'Failed to save shared graph' });
  }
});

// GET /api/share/:id
// Returns the stored snapshot or 404
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id || !/^[a-z0-9]{8}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid share ID' });
  }

  try {
    const firestore = getDb();
    const doc = await firestore.collection(COLLECTION).doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Shared graph not found' });
    }

    const data = doc.data();
    res.json({
      topic: data.topic,
      graphData: data.graphData,
      rootLabel: data.rootLabel,
      expandedNodes: data.expandedNodes,
      // Convert plain objects back to [key, value] pairs for new Map() on the client
      parentLabelOf: Object.entries(data.parentLabelOf || {}),
      originalPosition: Object.entries(data.originalPosition || {}),
    });
  } catch (err) {
    console.error('[share GET] error:', err.message);
    console.error('[share GET] code:', err.code);
    console.error('[share GET] stack:', err.stack);
    res.status(500).json({ error: 'Failed to load shared graph' });
  }
});

export default router;
