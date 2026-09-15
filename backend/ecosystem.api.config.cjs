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
      // Every hour at :20, in whatever time zone the server keeps: the first run after Monday
      // 00:15 UTC (the week's 00:00 close + 900s grace) settles the week, every other run is an
      // idempotent no-op costing a few RPC reads. A single Monday-00:20 slot fired at 22:20 UTC
      // Sunday on the Europe/Berlin VPS - before the close - and the week only settled at the
      // next deploy (2026-09-14).
      cron_restart: '20 * * * *',
      env: { NODE_ENV: 'production' },
      error_file: './logs/crank-err.log',
      out_file: './logs/crank-out.log',
      merge_logs: true,
    },
  ],
};
