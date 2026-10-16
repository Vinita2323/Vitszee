/**
 * PM2 ecosystem for Vitszee backend on a single VPS.
 * Adjust cwd if APP_DIR differs from /var/www/vitszee.
 *
 *   pm2 start scripts/deploy/ecosystem.config.cjs
 *   pm2 save
 */
const APP_DIR = process.env.APP_DIR || "/var/www/vitszee";

module.exports = {
  apps: [
    {
      name: "vitszee-api",
      cwd: `${APP_DIR}/backend`,
      script: "index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PROCESS_ROLE: "api",
        PORT: 7000,
      },
      max_memory_restart: "512M",
      time: true,
    },
    {
      name: "vitszee-worker",
      cwd: `${APP_DIR}/backend`,
      script: "index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PROCESS_ROLE: "worker",
        HEALTH_CHECK_PORT: 9090,
      },
      max_memory_restart: "512M",
      time: true,
    },
    {
      name: "vitszee-scheduler",
      cwd: `${APP_DIR}/backend`,
      script: "index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PROCESS_ROLE: "scheduler",
        HEALTH_CHECK_PORT: 9091,
        ENABLE_PAYOUT_BATCH_JOB: "true",
      },
      max_memory_restart: "256M",
      time: true,
    },
  ],
};
