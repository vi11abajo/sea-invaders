module.exports = {
  apps: [{
    name: 'sea-invaders-backend',
    script: './src/app.js',
    instances: 4, // Increased from 2 to 4 for supporting 200+ players
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Automatic restart when limits exceeded
    max_memory_restart: '500M',
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    // Watch disabled for production
    watch: false,
    // Automatic restart on crash
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
