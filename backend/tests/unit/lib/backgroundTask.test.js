/** Unit: runInBackground never lets a rejected background task escape as an
 *  unhandled rejection or propagate to the caller — it logs and swallows it. */
'use strict';

jest.mock('../../../src/lib/logger', () => ({ error: jest.fn() }));

const logger = require('../../../src/lib/logger');
const { runInBackground } = require('../../../src/lib/backgroundTask');

afterEach(() => jest.clearAllMocks());

test('returns immediately without waiting for the task to finish', () => {
	let resolved = false;
	runInBackground(() => new Promise((resolve) => setTimeout(() => { resolved = true; resolve(); }, 50)));
	expect(resolved).toBe(false);
});

test('a successful task never touches the logger', async () => {
	let ran = false;
	runInBackground(async () => { ran = true; });
	await new Promise((resolve) => setImmediate(resolve));

	expect(ran).toBe(true);
	expect(logger.error).not.toHaveBeenCalled();
});

test('a rejected task is caught and logged, not thrown', async () => {
	runInBackground(async () => { throw new Error('boom'); }, { some: 'context' });
	await new Promise((resolve) => setImmediate(resolve));

	expect(logger.error).toHaveBeenCalledWith(
		expect.objectContaining({ err: expect.any(Error), context: { some: 'context' } }),
		expect.any(String),
	);
});
