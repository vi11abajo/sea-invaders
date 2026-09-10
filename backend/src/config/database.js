import pg from 'pg';
// Environment variables are loaded in app.js before this module is imported

const { Pool } = pg;

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'sea_invaders',
  user: process.env.DB_USER || 'sea_invaders_user',
  password: process.env.DB_PASSWORD,
  max: 100, // maximum connections in pool (increased for supporting 200+ players)
  min: 10, // minimum connections always open
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // increased for stability under high load
  allowExitOnIdle: false, // don't close pool when idle
});

// Connection check
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  console.error('   Pool will attempt to reconnect automatically');
});

// Test request
export async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('🔗 Database connection test:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

export default pool;
