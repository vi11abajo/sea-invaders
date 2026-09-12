import { CORE_VERSION } from '@sea-invaders/core';
import express from 'express';
import * as db from '../db/rankedRuns.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { confirmLimiter, scoreSubmitLimiter, sessionLimiter } from '../middleware/rateLimit.js';
import { dailySeed, dayOf, isSeedPublic, weekOf } from '../services/dailySeed.js';
import { RankedRunError, finishRun, startRun, todayInfo } from '../services/rankedRuns.js';
import { confirmRecord, issueRecord, issueTicket, weekView } from '../services/records.js';
import { confirmTicket } from '../services/tickets.js';

const router = express.Router();
const nowSeconds = () => Math.floor(Date.now() / 1000);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/today', optionalAuth, async (req, res, next) => {
  try {
    const info = await todayInfo({ userId: req.user?.userId ?? null, wallet: req.user?.walletAddress ?? null, now: nowSeconds() });
    res.json({ ...info, coreVersion: CORE_VERSION });
  } catch (error) {
    next(error);
  }
});

router.post('/runs', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    res.status(201).json(await startRun({ userId: req.user.userId, wallet: req.user.walletAddress, now: nowSeconds() }));
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

router.post('/ticket', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    res.status(201).json(await issueTicket({ wallet: req.user.walletAddress, now: nowSeconds() }));
  } catch (error) {
    next(error);
  }
});

router.post('/ticket/confirm', authenticateToken, confirmLimiter, async (req, res, next) => {
  try {
    const signature = typeof req.body?.signature === 'string' ? req.body.signature : '';
    if (!signature) return res.status(400).json({ error: 'BadRequest', message: 'signature is required' });
    const result = await confirmTicket({ userId: req.user.userId, wallet: req.user.walletAddress, signature, now: nowSeconds() });
    res.status(result.confirmed ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/records', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    const day = Number.parseInt(req.body?.day, 10);
    if (!Number.isInteger(day) || day < 0) return res.status(400).json({ error: 'BadRequest', message: 'day must be a non-negative integer' });
    res.status(201).json(await issueRecord({ userId: req.user.userId, wallet: req.user.walletAddress, day, now: nowSeconds() }));
  } catch (error) {
    next(error);
  }
});

router.post('/records/confirm', authenticateToken, confirmLimiter, async (req, res, next) => {
  try {
    const day = Number.parseInt(req.body?.day, 10);
    const signature = typeof req.body?.signature === 'string' ? req.body.signature : '';
    if (!Number.isInteger(day) || day < 0 || !signature) {
      return res.status(400).json({ error: 'BadRequest', message: 'signature and day are required' });
    }
    const result = await confirmRecord({ userId: req.user.userId, wallet: req.user.walletAddress, day, signature });
    res.status(result.confirmed ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/week', async (req, res, next) => {
  try {
    const week = req.query.week === undefined ? weekOf(dayOf(nowSeconds())) : Number.parseInt(String(req.query.week), 10);
    if (!Number.isInteger(week) || week < 0) return res.status(400).json({ error: 'BadRequest', message: 'week must be a non-negative integer' });
    res.json(await weekView({ week, now: nowSeconds() }));
  } catch (error) {
    next(error);
  }
});

/** Maps RankedRunError to its HTTP status; everything else falls through to the app's error handler. */
router.use((err, req, res, next) => {
  if (err instanceof RankedRunError) {
    return res.status(err.status).json({ error: 'RankedRun', code: err.code, message: err.message, ...err.extra });
  }
  next(err);
});

export default router;
