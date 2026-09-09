/**
 * Background-job abstraction (architecture.md §5.5). Anything not needed to
 * answer the current request synchronously runs here. Start with an in-process
 * fire-and-forget worker + its own error handling; promote to BullMQ/Redis later.
 */
'use strict';
module.exports = { enqueue: async () => {} };
