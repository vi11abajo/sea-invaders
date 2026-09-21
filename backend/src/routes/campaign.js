import express from 'express';
import * as db from '../db/campaign.js';
import { authenticateToken } from '../middleware/auth.js';
import { extendProgress, isValidProgress, mergeProgress } from '@sea-invaders/core';

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const progress = await db.getProgress(req.user.userId);
    if (!progress) return res.status(404).json({ error: 'CampaignProgress', code: 'not_found', message: 'No campaign progress yet' });
    res.json({ progress });
  } catch (error) {
    next(error);
  }
});

router.put('/', authenticateToken, async (req, res, next) => {
  try {
    const body = req.body?.progress;
    if (!isValidProgress(body)) {
      return res.status(400).json({ error: 'BadRequest', code: 'invalid_progress', message: 'progress is not a valid campaign progress object' });
    }
    // An app from before reefs 6-10 sends (and an older server stored) a thirty-level record; both
    // sides grow to the full sixty before they are merged, so the answer is always the full length.
    const incoming = extendProgress(body);
    const stored = await db.getProgress(req.user.userId);
    const merged = stored ? mergeProgress(extendProgress(stored), incoming) : incoming;
    await db.upsertProgress(req.user.userId, merged);
    res.json({ progress: merged });
  } catch (error) {
    next(error);
  }
});

export default router;
