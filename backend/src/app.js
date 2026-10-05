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
const authInvitePage = require('./authInvitePage');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.get('/auth/accept-invite', (_req, res) => {
  // This page is served before helmet runs, so it needs its own headers. The
  // invite token is in the URL, so no-referrer keeps it out of Referer headers,
  // and frame-ancestors/DENY stops the password form from being framed.
  res.set({
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.type('html').send(authInvitePage);
});

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
