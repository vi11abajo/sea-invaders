const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Connect to PostgreSQL (first to the postgres DB, to create the new DB)
const createDatabase = async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres', // Connect to the default DB
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL server');

    // Check whether the sea_invaders DB exists
    const checkDb = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'sea_invaders'"
    );

    if (checkDb.rows.length === 0) {
      // Create the DB
      await client.query('CREATE DATABASE sea_invaders');
      console.log('✅ Database "sea_invaders" created');
    } else {
      console.log('ℹ️  Database "sea_invaders" already exists');
    }

    await client.end();
  } catch (error) {
    console.error('❌ Error creating database:', error.message);
    await client.end();
    throw error;
  }
};

// Create the table and seed it
const initializeTable = async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await client.connect();
    console.log('✅ Connected to sea_invaders database');

    // Create the leaderboard table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        player VARCHAR(100) NOT NULL,
        score INTEGER NOT NULL,
        level INTEGER NOT NULL,
        date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Table "leaderboard" created');

    // Indexes for fast reads
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_date ON leaderboard(date DESC);
    `);
    console.log('✅ Indexes created');

    // Count existing rows
    const countResult = await client.query('SELECT COUNT(*) FROM leaderboard');
    const currentCount = parseInt(countResult.rows[0].count);

    if (currentCount === 0) {
      console.log('📝 Generating 50 mock leaderboard entries...');

      // Generate 50 rows
      const names = [
        'SpaceAce', 'AlienHunter', 'CosmicWarrior', 'StarDefender', 'GalaxyGuard',
        'NeonNinja', 'PixelPilot', 'RetroRacer', 'ArcadeKing', 'HighScoreHero',
        'LaserLegend', 'ShieldMaster', 'BlasterBoss', 'InvaderSlayer', 'PowerPlayer',
        'TurboTactician', 'SuperShooter', 'MegaMaster', 'UltraGamer', 'ProPlayer',
        'OctoMaster', 'CrabDestroyer', 'WaveRider', 'SeaWarrior', 'DeepDiver',
        'TidalForce', 'CoralCrusher', 'KrakenSlayer', 'SailorSniper', 'BaseHero',
      ];

      const entries = [];
      const usedPlayers = new Set();

      // Generate 50 unique players
      for (let i = 0; i < 50; i++) {
        let playerName;
        do {
          const randomName = names[Math.floor(Math.random() * names.length)];
          const randomNumber = Math.floor(Math.random() * 9999);
          playerName = `${randomName}#${randomNumber}`;
        } while (usedPlayers.has(playerName));
        usedPlayers.add(playerName);

        // Scores from 50000 down to 1000 (top 50)
        const maxScore = 50000;
        const minScore = 1000;
        const scoreRange = maxScore - minScore;
        const scoreProgress = i / 49; // 0 to 1
        const baseScore = maxScore - (scoreRange * scoreProgress);
        const score = Math.floor(baseScore + (Math.random() * 500 - 250));

        // Level depends on the score
        const level = Math.max(1, Math.floor(score / 2000) + Math.floor(Math.random() * 3));

        // Date: backdated within the last 30 days
        const daysAgo = Math.floor(Math.random() * 30);
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        date.setHours(Math.floor(Math.random() * 24));
        date.setMinutes(Math.floor(Math.random() * 60));

        entries.push({
          player: playerName,
          score,
          level,
          date: date.toISOString(),
        });
      }

      // Insert all rows in one query
      const values = entries.map((e, idx) => {
        const offset = idx * 4;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
      }).join(', ');

      const params = entries.flatMap(e => [e.player, e.score, e.level, e.date]);

      await client.query(
        `INSERT INTO leaderboard (player, score, level, date) VALUES ${values}`,
        params
      );

      console.log(`✅ Inserted 50 mock entries into leaderboard`);
    } else {
      console.log(`ℹ️  Leaderboard already has ${currentCount} entries. Skipping insert.`);
    }

    // Print the top 5 as a check
    const topPlayers = await client.query(
      'SELECT player, score, level, date FROM leaderboard ORDER BY score DESC LIMIT 5'
    );
    console.log('\n🏆 Top 5 players:');
    topPlayers.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.player} - ${row.score} pts (Level ${row.level}) - ${row.date.toISOString().split('T')[0]}`);
    });

    await client.end();
    console.log('\n✅ Database initialization completed successfully!');
  } catch (error) {
    console.error('❌ Error initializing table:', error.message);
    await client.end();
    throw error;
  }
};

// Run the initialization
(async () => {
  try {
    await createDatabase();
    await initializeTable();
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
})();
