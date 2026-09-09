/**
 * Structured JSON logger (pino). No free-text console.log anywhere else
 * (architecture.md §6). Pretty-prints in development, raw JSON in prod.
 */
'use strict';

const pino = require('pino');

const level = process.env.LOG_LEVEL || 'info';
const isDev = (process.env.NODE_ENV || 'development') === 'development';

const logger = pino({
  level,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

module.exports = logger;
