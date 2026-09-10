// CRITICAL: Load environment variables FIRST before any other imports
// This must be the very first import to ensure .env is loaded before config modules
import './loadEnv.js';

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// Config
import { testConnection } from './config/database.js';
import { validateDiscordConfig } from './config/discord.js';
import { validateJwtConfig } from './config/jwt.js';

// Middleware
import { apiLimiter } from './middleware/rateLimit.js';

// Routes
import authRoutes from './routes/auth.js';
import scoresRoutes from './routes/scores.js';
import leaderboardRoutes from './routes/leaderboard.js';

const app = express();
const httpServer = createServer(app);

// ====================================
// MIDDLEWARE
// ====================================

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ====================================
// HEALTH CHECK
// ====================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Sea Invaders API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      scores: '/api/scores',
      leaderboard: '/api/leaderboard',
    },
  });
});

// ====================================
// API ROUTES
// ====================================

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/scores', scoresRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// ====================================
// ERROR HANDLING
// ====================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: 'Endpoint not found',
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);

  res.status(err.status || 500).json({
    error: err.name || 'ServerError',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ====================================
// SERVER STARTUP
// ====================================

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('🚀 Starting Sea Invaders Backend...\n');

    // Validate configurations
    console.log('🔧 Validating configurations...');
    validateDiscordConfig();
    validateJwtConfig();

    // Test database connection
    console.log('🔗 Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('⚠️  Database connection failed - server will start but data endpoints may not work');
      console.error('   Check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD environment variables');
    }

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log('\n✅ Server is running!');
      console.log(`📡 HTTP Server: http://localhost:${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🎮 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      console.log('\n📚 Available endpoints:');
      console.log(`   GET  / - API info`);
      console.log(`   GET  /health - Health check`);
      console.log(`   GET  /api/auth/discord - Discord OAuth`);
      console.log(`   POST /api/scores/submit - Submit score`);
      console.log(`   GET  /api/leaderboard/main - Main leaderboard`);
      console.log('\n🎯 Ready to accept connections!\n');
    });

    // Graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
function gracefulShutdown() {
  console.log('\n⚠️  Received shutdown signal, closing server gracefully...');

  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Start the server
startServer();

// PM2 ready signal
if (process.send) {
  process.send('ready');
}

export default app;
