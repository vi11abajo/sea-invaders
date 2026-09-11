import { CORE_VERSION } from '@sea-invaders/core';
import express from 'express';
import * as db from '../db/rankedRuns.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { scoreSubmitLimiter, sessionLimiter } from '../middleware/rateLimit.js';
import { dailySeed, dayOf, isSeedPublic } from '../services/dailySeed.js';
import { RankedRunError, finishRun, startRun, todayInfo } from '../services/rankedRuns.js';

const router = express.Router();
const nowSeconds = () => Math.floor(Date.now() / 1000);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/today', optionalAuth, async (req, res, next) => {
  try {
    const info = await todayInfo({ userId: req.user?.userId ?? null, now: nowSeconds() });
    res.json({ ...info, coreVersion: CORE_VERSION });
  } catch (error) {
    next(error);
  }
});

router.post('/runs', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    res.status(201).json(await startRun({ userId: req.user.userId, now: nowSeconds() }));
  } catch (error) {
    next(error);
  }
});

router.post('/runs/:runId/finish', authenticateToken, scoreSubmitLimiter, async (req, res, next) => {
  try {
    const runId = String(req.params.runId);
    if (!UUID_RE.test(runId)) return res.status(404).json({ error: 'RankedRun', code: 'run_not_found', message: 'Run not found' });
    res.json(await finishRun({ userId: req.user.userId, runId, replayBase64: req.body?.replay, now: nowSeconds() }));
  } catch (error) {
    next(error);
  }
});

router.get('/leaderboard', async (req, res, next) => {
  try {
    const day = req.query.day === undefined ? dayOf(nowSeconds()) : Number.parseInt(String(req.query.day), 10);
    if (!Number.isInteger(day) || day < 0) return res.status(400).json({ error: 'BadRequest', message: 'day must be a non-negative integer' });
    const rows = await db.leaderboardForDay(day, 50);
    res.json({ day, entries: rows.map((row, i) => ({ rank: i + 1, username: row.username, walletAddress: row.walletAddress, score: row.score })) });
  } catch (error) {
    next(error);
  }
});

router.get('/seed/:day', (req, res) => {
  const day = Number.parseInt(String(req.params.day), 10);
  if (!Number.isInteger(day) || day < 0) return res.status(400).json({ error: 'BadRequest', message: 'day must be a non-negative integer' });
  if (!isSeedPublic(day, nowSeconds())) return res.status(404).json({ error: 'SeedNotPublic', message: 'The seed is published once the day closes' });
  res.json({ day, seed: dailySeed(process.env.DAILY_SEED_SECRET, day) });
});

/** Maps RankedRunError to its HTTP status; everything else falls through to the app's error handler. */
router.use((err, req, res, next) => {
  if (err instanceof RankedRunError) {
    return res.status(err.status).json({ error: 'RankedRun', code: err.code, message: err.message });
  }
  next(err);
});

export default router;
