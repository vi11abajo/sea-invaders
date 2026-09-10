import { Pool } from 'pg';

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Production settings
  max: 20, // At most 20 connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 s
  connectionTimeoutMillis: 2000, // 2 s connection timeout
});

// Connection check on startup
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

export default pool;
