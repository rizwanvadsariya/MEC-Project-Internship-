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
  // Bearer tokens and cookies must never reach the logs. pino-http logs request
  // headers by default, so the Authorization header (the user's JWT) would be
  // written on every request without this (architecture.md §4.6).
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' },
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
