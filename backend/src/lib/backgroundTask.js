/**
 * Fire-and-forget wrapper for work that must never block or fail the request
 * that triggered it (architecture.md §6: "notification fan-out ... runs as a
 * background job ... at minimum a fire-and-forget task with its own error
 * handling"). No queue/worker infra exists in this project yet, so this is
 * that minimum viable form — in-process, but decoupled from the response,
 * with errors caught and logged rather than thrown or left unhandled.
 */
'use strict';

const logger = require('./logger');

function runInBackground(fn, context) {
	Promise.resolve()
		.then(fn)
		.catch((err) => logger.error({ err, context }, '[backgroundTask] background task failed'));
}

module.exports = { runInBackground };
