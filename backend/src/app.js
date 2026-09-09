/**
 * Express application assembly — the middleware chain from architecture.md §2:
 *   helmet -> CORS allow-list -> request logger -> JSON body parser
 *   -> /api/v1 router -> notFound -> centralized errorHandler
 *
 * Exports the configured app (no .listen here — server.js owns that) so tests
 * can mount it with supertest.
 */
'use strict';

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');

const { config } = require('./config');
const logger = require('./lib/logger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const v1 = require('./api/v1');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    credentials: true,
  }),
);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
  }),
);
app.use(express.json({ limit: '1mb' }));

app.use('/api/v1', v1);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
