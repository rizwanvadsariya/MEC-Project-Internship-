/** Terminal 404 for unmatched routes. */
'use strict';

module.exports = function notFound(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}` } });
};
