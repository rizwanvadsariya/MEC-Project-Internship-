/** Uniform success envelope: { data, meta } incl. pagination cursors. */
'use strict';

function ok(res, data, meta) {
  return res.json({ data, ...(meta ? { meta } : {}) });
}

function created(res, data, meta) {
  return res.status(201).json({ data, ...(meta ? { meta } : {}) });
}

function noContent(res) {
  return res.status(204).end();
}

module.exports = { ok, created, noContent };
