import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { apiLimiter } from './middleware/rateLimit.js';
import dailyRoutes from './routes/daily.js';
import campaignRoutes from './routes/campaign.js';
import siwsRoutes from './routes/siws.js';
import devnetRoutes from './routes/devnet.js';
import shopRoutes from './routes/shop.js';
import profileRoutes from './routes/profile.js';
import reviveRoutes from './routes/revive.js';
import swapRoutes from './routes/swap.js';
import seekerRoutes from './routes/seeker.js';
import { currentCluster } from './chain/config.js';

/** Path of the route that uploads a finished run's replay; it gets a larger body limit than the rest. */
const FINISH_RUN_PATH = '/api/daily/runs/:runId/finish';

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp() {
  const app = express();
  // The only proxy in front of the API is nginx on this same host. Trusting loopback makes `req.ip`
  // the address nginx appends to X-Forwarded-For, so the rate limiters key every player on their
  // own address; without it every anonymous request would share nginx's 127.0.0.1 bucket.
  app.set('trust proxy', 'loopback');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  // A finished run's body carries the whole replay (up to MAX_REPLAY_BASE64 = 400,000 base64
  // characters, services/rankedRuns.js), so that route is parsed first with a 512 KB limit. The
  // parser below leaves a body that is already parsed alone, so every other route keeps 256 KB.
  app.use(FINISH_RUN_PATH, express.json({ limit: '512kb' }));
  app.use(express.json({ limit: '256kb' }));
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
    res.json({ name: 'Sea Invaders API', version: '1.0.0', status: 'running', endpoints: { auth: '/api/auth/siws', daily: '/api/daily' } });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth/siws', siwsRoutes);
  app.use('/api/daily', dailyRoutes);
  app.use('/api/campaign', campaignRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/revive', reviveRoutes);
  app.use('/api/swap', swapRoutes);
  app.use('/api/seeker', seekerRoutes);
  if (currentCluster() === 'devnet') {
    app.use('/api/devnet', devnetRoutes);
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'NotFound', message: 'Endpoint not found', path: req.path });
  });
  app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    const production = process.env.NODE_ENV === 'production';
    // A server fault's own message can name tables, constraints or RPC details: in production the
    // client gets a fixed answer and the details stay in the log above. A 4xx is about the request,
    // so its message is kept.
    if (production && status >= 500) {
      return res.status(status).json({ error: 'Internal', message: 'Something went wrong' });
    }
    res.status(status).json({
      error: err.name || 'ServerError',
      message: err.message || 'Internal server error',
      ...(!production && { stack: err.stack }),
    });
  });
  return app;
}
