import { CORE_VERSION } from '@sea-invaders/core';
import express from 'express';
import * as db from '../db/rankedRuns.js';
import { findSeekerWallets } from '../db/users.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { confirmLimiter, scoreSubmitLimiter, sessionLimiter } from '../middleware/rateLimit.js';
import { dailySeed, dayOf, isSeedPublic, weekOf } from '../services/dailySeed.js';
import { RankedRunError, finishRun, startRun, todayInfo } from '../services/rankedRuns.js';
import { confirmRecord, issueRecord, issueTicket, weekView } from '../services/records.js';
import { confirmTicket } from '../services/tickets.js';

const router = express.Router();
const nowSeconds = () => Math.floor(Date.now() / 1000);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A day or week number from a request: plain digits (a JSON number or a numeric string) no larger
 * than `max`, else `null`. The cap keeps a number the database or a PDA seed cannot hold out of
 * both, so a bad value is a 400 rather than a server error.
 */
function boundedNumber(raw, max) {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
  if (!/^\d{1,9}$/.test(text)) return null;
  const n = Number(text);
  return n <= max ? n : null;
}

/** The latest day a request may name: tomorrow, so a client clock slightly ahead of the server still fits. */
const maxDay = () => dayOf(nowSeconds()) + 1;
/** The latest week a request may name: next week, for the same reason. */
const maxWeek = () => weekOf(dayOf(nowSeconds())) + 1;
const badDay = (res) => res.status(400).json({ error: 'BadRequest', message: `day must be a whole number from 0 to ${maxDay()}` });
const badWeek = (res) => res.status(400).json({ error: 'BadRequest', message: `week must be a whole number from 0 to ${maxWeek()}` });

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
    // An app may say which core it plays with. One on another core is told to update here, before
    // a run is created or an attempt counted; an app that says nothing starts as before.
    const clientCore = req.body?.coreVersion;
    if (clientCore !== undefined) {
      if (!Number.isInteger(clientCore)) return res.status(400).json({ error: 'BadRequest', message: 'coreVersion must be an integer' });
      if (clientCore !== CORE_VERSION) {
        return res.status(426).json({
          error: 'UpdateRequired', code: 'update_required', message: `This app plays core version ${clientCore}; ranked runs need ${CORE_VERSION}`, coreVersion: CORE_VERSION,
        });
      }
    }
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
    const day = req.query.day === undefined ? dayOf(nowSeconds()) : boundedNumber(req.query.day, maxDay());
    if (day === null) return badDay(res);
    const rows = await db.leaderboardForDay(day, 50);
    // The SEEKER badge for the whole board in one query, rather than a chain read per row (design doc §3).
    const seekers = new Set(await findSeekerWallets(rows.map((row) => row.walletAddress)));
    res.json({
      day,
      entries: rows.map((row, i) => ({
        rank: i + 1,
        username: row.username,
        walletAddress: row.walletAddress,
        score: row.score,
        skin: row.skin,
        seeker: seekers.has(row.walletAddress),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/seed/:day', (req, res) => {
  const day = boundedNumber(req.params.day, maxDay());
  if (day === null) return badDay(res);
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
    const day = boundedNumber(req.body?.day, maxDay());
    if (day === null) return badDay(res);
    res.status(201).json(await issueRecord({ userId: req.user.userId, wallet: req.user.walletAddress, day, now: nowSeconds() }));
  } catch (error) {
    next(error);
  }
});

router.post('/records/confirm', authenticateToken, confirmLimiter, async (req, res, next) => {
  try {
    const day = boundedNumber(req.body?.day, maxDay());
    const signature = typeof req.body?.signature === 'string' ? req.body.signature : '';
    if (day === null || !signature) {
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
    const week = req.query.week === undefined ? weekOf(dayOf(nowSeconds())) : boundedNumber(req.query.week, maxWeek());
    if (week === null) return badWeek(res);
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
