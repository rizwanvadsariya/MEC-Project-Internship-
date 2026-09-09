/**
 * HTTP server bootstrap. Loads + validates config, verifies the DB connection
 * once, then starts the Express app. Process-level concerns only.
 */
'use strict';

const { config } = require('./config');
const logger = require('./lib/logger');
const app = require('./app');
const db = require('./config/database');

async function start() {
  try {
    const now = await db.ping();
    logger.info({ now }, 'database connection OK');
  } catch (err) {
    logger.error({ err }, 'database connection FAILED — check DATABASE_URL in backend/.env');
    process.exit(1);
  }

  const server = app.listen(config.PORT, () => {
    logger.info(`API listening on http://localhost:${config.PORT}/api/v1`);
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
}

start();
