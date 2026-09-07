// Idempotent seed of the ADP reference data. Safe to rerun: every write is an
// upsert keyed on `name`, so no duplicates are created.
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const { Department, SubSector, District } = require("../models");
const { DEPARTMENTS, BLOCK_ALLOCATIONS, SUB_SECTORS, DISTRICTS } = require("./referenceData");
const logger = require("../utils/logger");

async function seedDepartments() {
	const rows = [
		...DEPARTMENTS.map((d) => ({ ...d, type: "department" })),
		...BLOCK_ALLOCATIONS.map((d) => ({ ...d, type: "block_allocation" })),
	];
	await Promise.all(
		rows.map((d) =>
			Department.updateOne(
				{ name: d.name },
				{ $set: { adpSerialNo: d.adpSerialNo, type: d.type } },
				{ upsert: true },
			),
		),
	);
	return rows.length;
}

async function seedSubSectors() {
	let count = 0;
	for (const [deptName, subs] of Object.entries(SUB_SECTORS)) {
		// eslint-disable-next-line no-await-in-loop
		const dept = await Department.findOne({ name: deptName });
		if (!dept) continue;
		// eslint-disable-next-line no-await-in-loop
		await Promise.all(
			subs.map((name) =>
				SubSector.updateOne(
					{ departmentId: dept._id, name },
					{ $setOnInsert: { departmentId: dept._id, name } },
					{ upsert: true },
				),
			),
		);
		count += subs.length;
	}
	return count;
}

async function seedDistricts() {
	await Promise.all(
		DISTRICTS.map((name) =>
			District.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true }),
		),
	);
	return DISTRICTS.length;
}

async function run() {
	const d = await seedDepartments();
	const s = await seedSubSectors();
	const di = await seedDistricts();
	logger.info(`Seed complete: ${d} departments/blocks, ${s} sub-sectors, ${di} districts`);
}

module.exports = { run, seedDepartments, seedSubSectors, seedDistricts };

if (require.main === module) {
	const uri = process.env.MONGO_URI || process.env.MONGO_ATLAS_URI;
	mongoose
		.connect(uri)
		.then(run)
		.then(() => mongoose.disconnect())
		.then(() => process.exit(0))
		.catch((e) => {
			// eslint-disable-next-line no-console
			console.error(e);
			process.exit(1);
		});
}
