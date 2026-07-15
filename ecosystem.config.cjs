const path = require("node:path");

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
        APP_PORT: "8787",
        MEDIA_BOT_PROFILE_EXECUTABLE: path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
        MEDIA_BOT_PROFILE_ROOT: path.resolve(__dirname, "../media-bot"),
        MEDIA_BOT_PROFILE_PYTHON_VERSION: "3.12"
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      log_file: "logs/pm2-combined.log",
      time: true,
      merge_logs: true
    }
  ]
};
