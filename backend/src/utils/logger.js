// Minimal leveled logger. Silent during tests.
const silent = process.env.NODE_ENV === "test";

function log(level, ...args) {
	if (silent) return;
	// eslint-disable-next-line no-console
	console[level === "error" ? "error" : "log"](`[${level}]`, ...args);
}

module.exports = {
	info: (...a) => log("info", ...a),
	warn: (...a) => log("warn", ...a),
	error: (...a) => log("error", ...a),
};
