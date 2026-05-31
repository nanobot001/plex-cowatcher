module.exports = {
  apps: [
    {
      name: "plex-cowatch-service",
      cwd: __dirname,
      script: "dist/server/app.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      min_uptime: "10s",
      restart_delay: 5000,
      watch: false,
      env: {
        NODE_ENV: "production",
        APP_HOST: "127.0.0.1",
        APP_PORT: "8787"
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      log_file: "logs/pm2-combined.log",
      time: true,
      merge_logs: true
    }
  ]
};
