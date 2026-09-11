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
  ],
};
