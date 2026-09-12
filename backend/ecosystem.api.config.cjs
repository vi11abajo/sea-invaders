// PM2 apps for the Sea Invaders API on the VPS (api.seainvaders.xyz).
// The backend runs as ONE process on purpose: the SIWS nonce store and the leaderboard cache live in memory.
module.exports = {
  apps: [
    {
      name: 'sea-invaders-api',
      script: './src/app.js',
      cwd: '/var/www/sea-invaders-api/backend',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 5439 },
      error_file: './logs/api-err.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
      kill_timeout: 5000,
    },

    // Weekly crank: creates the upcoming week pools and settles the finished week (see
    // `src/jobs/weekly.js`). Runs once on the cron schedule below and exits; `autorestart: false`
    // is intentional - PM2 correctly shows this app as "stopped" between runs.
    {
      name: 'weekly-crank',
      script: './src/jobs/weekly.js',
      cwd: '/var/www/sea-invaders-api/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      cron_restart: '20 0 * * 1', // Monday 00:20 UTC - after the week's 00:15 (00:00 + 900s grace) close
      env: { NODE_ENV: 'production' },
      error_file: './logs/crank-err.log',
      out_file: './logs/crank-out.log',
      merge_logs: true,
    },
  ],
};
