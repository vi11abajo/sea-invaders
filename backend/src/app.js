// CRITICAL: Load environment variables FIRST before any other imports
import './loadEnv.js';

import { createServer } from 'http';
import { testConnection } from './config/database.js';
import { validateJwtConfig } from './config/jwt.js';
import { createApp } from './createApp.js';

const app = createApp();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('🚀 Starting Sea Invaders Backend...\n');
    console.log('🔧 Validating configurations...');
    validateJwtConfig();
    console.log('🔗 Testing database connection...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('⚠️  Database connection failed - server will start but data endpoints may not work');
      console.error('   Check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD environment variables');
    }
    httpServer.listen(PORT, () => {
      console.log('\n✅ Server is running!');
      console.log(`📡 HTTP Server: http://localhost:${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('\n🎯 Ready to accept connections!\n');
    });
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

function gracefulShutdown() {
  console.log('\n⚠️  Received shutdown signal, closing server gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

startServer();

if (process.send) {
  process.send('ready');
}

export default app;
