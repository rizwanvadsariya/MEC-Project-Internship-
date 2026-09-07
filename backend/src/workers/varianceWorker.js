// Nightly job: recompute variance for every scheme against the latest ADP
// financial records, independent of inspection submissions.
const { Scheme } = require("../models");
const varianceEngine = require("../services/varianceEngine");
const logger = require("../utils/logger");

async function runNightlyVarianceSweep() {
	const ids = await Scheme.find().select("_id").lean();
	let computed = 0;
	for (const { _id } of ids) {
		// eslint-disable-next-line no-await-in-loop
		const rec = await varianceEngine.computeVarianceForScheme(_id);
		if (rec) computed += 1;
	}
	logger.info(`Nightly variance sweep: ${computed}/${ids.length} schemes had a variance record written`);
	return { total: ids.length, computed };
}

// Schedule at ~02:00 local time when started as a standalone process.
function schedule() {
	const DAY = 24 * 60 * 60 * 1000;
	function msUntil2am() {
		const now = new Date();
		const next = new Date(now);
		next.setHours(2, 0, 0, 0);
		if (next <= now) next.setTime(next.getTime() + DAY);
		return next - now;
	}
	setTimeout(function tick() {
		runNightlyVarianceSweep().catch((e) => logger.error("variance sweep failed", e.message));
		setInterval(() => {
			runNightlyVarianceSweep().catch((e) => logger.error("variance sweep failed", e.message));
		}, DAY);
	}, msUntil2am());
}

module.exports = { runNightlyVarianceSweep, schedule };

if (require.main === module) {
	require("../config/db")
		.connectDatabase()
		.then(schedule)
		.catch((e) => {
			logger.error(e.message);
			process.exit(1);
		});
}
