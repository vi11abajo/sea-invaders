import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { apiLimiter } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import scoresRoutes from './routes/scores.js';
import leaderboardRoutes from './routes/leaderboard.js';
import siwsRoutes from './routes/siws.js';

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));
  if (process.env.NODE_ENV === 'test') {
    // no request logging in tests
  } else if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), environment: process.env.NODE_ENV || 'development' });
  });
  app.get('/', (req, res) => {
    res.json({ name: 'Sea Invaders API', version: '1.0.0', status: 'running', endpoints: { auth: '/api/auth', scores: '/api/scores', leaderboard: '/api/leaderboard', daily: '/api/daily' } });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/auth/siws', siwsRoutes);
  app.use('/api/scores', scoresRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'NotFound', message: 'Endpoint not found', path: req.path });
  });
  app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(err.status || 500).json({
      error: err.name || 'ServerError',
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
  });
  return app;
}
