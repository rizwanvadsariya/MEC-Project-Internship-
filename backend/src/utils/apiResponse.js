// Standardized JSON response wrapper.
function ok(res, data, status = 200) {
	return res.status(status).json({ success: true, data });
}

function created(res, data) {
	return ok(res, data, 201);
}

function fail(res, message, status = 400, details) {
	return res.status(status).json({ success: false, message, ...(details ? { details } : {}) });
}

module.exports = { ok, created, fail };
