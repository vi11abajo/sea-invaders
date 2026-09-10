import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  try {
    console.log('🚀 Starting database migrations...');

    // Create table for tracking migrations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // List of migrations in correct order
    const migrations = [
      '001_initial_schema.sql',
      '002_performance_optimization.sql',
      '004_farcaster_migration.sql'
    ];

    // Execute each migration
    for (const migrationFile of migrations) {
      // Check if this migration has already been executed
      const result = await pool.query(
        'SELECT * FROM migrations WHERE name = $1',
        [migrationFile]
      );

      if (result.rows.length > 0) {
        console.log(`⏭️  Skipping ${migrationFile} (already executed)`);
        continue;
      }

      console.log(`\n📄 Running migration: ${migrationFile}`);

      const sqlPath = join(__dirname, migrationFile);
      const sql = readFileSync(sqlPath, 'utf8');

      await pool.query(sql);

      // Record successfully executed migration
      await pool.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [migrationFile]
      );

      console.log(`✅ ${migrationFile} completed`);
    }

    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
