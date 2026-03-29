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
// Body: { topic, graphData, rootLabel, expandedNodes, parentLabelOf, originalPosition }
// Returns: { id }
router.post('/', async (req, res) => {
  const { topic, graphData, rootLabel, expandedNodes, parentLabelOf, originalPosition } = req.body;

  if (!graphData?.nodes?.length) {
    return res.status(400).json({ error: 'graphData with nodes is required' });
  }

  try {
    const firestore = getDb();

    // Generate a unique ID (retry once on collision — extremely unlikely)
    let id = makeId();
    const existing = await firestore.collection(COLLECTION).doc(id).get();
    if (existing.exists) id = makeId();

    await firestore.collection(COLLECTION).doc(id).set({
      id,
      topic: topic || '',
      graphData,
      rootLabel: rootLabel || '',
      expandedNodes: expandedNodes || [],
      parentLabelOf: parentLabelOf || [],
      originalPosition: originalPosition || [],
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
      parentLabelOf: data.parentLabelOf,
      originalPosition: data.originalPosition,
    });
  } catch (err) {
    console.error('[share GET] error:', err.message);
    console.error('[share GET] code:', err.code);
    console.error('[share GET] stack:', err.stack);
    res.status(500).json({ error: 'Failed to load shared graph' });
  }
});

export default router;
