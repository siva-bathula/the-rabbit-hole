import { Router } from 'express';
import { compareAcrossSubjects } from '../services/deepseek.js';

const router = Router();

router.post('/', async (req, res) => {
  const { subjects, dimensionLabel, labelsPerSubject, sessionTopic, groundingContext } =
    req.body || {};

  if (!Array.isArray(subjects) || subjects.length < 2 || !dimensionLabel?.trim()) {
    return res
      .status(400)
      .json({ error: 'subjects (at least 2) and dimensionLabel are required' });
  }

  const cleanedSubjects = subjects.map((s) => String(s).trim()).filter(Boolean);
  if (cleanedSubjects.length < 2) {
    return res.status(400).json({ error: 'Invalid subjects' });
  }

  try {
    const data = await compareAcrossSubjects({
      subjects: cleanedSubjects,
      dimensionLabel: String(dimensionLabel).trim(),
      labelsPerSubject: Array.isArray(labelsPerSubject) ? labelsPerSubject : [],
      sessionTopic: typeof sessionTopic === 'string' ? sessionTopic : '',
      groundingContext: typeof groundingContext === 'string' ? groundingContext : '',
    });
    res.json(data);
  } catch (err) {
    console.error('[compare]', err.message);
    res.status(500).json({ error: 'Failed to compare subjects' });
  }
});

export default router;
