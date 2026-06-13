module.exports = {
  apps: [
    {
      name: "gwehai-api",
      script: "./backend/dist/src/main.js",
      cwd: "/home/www/gwehai",
      interpreter: "node",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "10s",
      exp_backoff_restart_delay: 1000,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3100,
      },
    },
  ],
};
