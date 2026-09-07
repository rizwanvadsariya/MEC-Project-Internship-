/**
 * Idempotent importer for the ADP 2026-2027 Volume V scheme ledger.
 *
 * Consumes the machine-extracted JSON produced from Download.pdf by
 * backend/src/seeders/parseAdpLedger.py (which itself reads the word-coordinate
 * cache written by backend/src/seeders/cache_words.py):
 *   src/seeders/data/adp_departments.json  [{ name, adpSerialNo, type }]
 *   src/seeders/data/adp_subsectors.json   [{ department, name, code }]
 *   src/seeders/data/adp_schemes.json      [{ uid, genSerialNo, name, department,
 *                                            subSector, districts[], provinceWide,
 *                                            adpApproval{status,approvalDate,underRevision},
 *                                            schemeCategory, targetCompletionDate,
 *                                            estimatedCost, sourceEdition{page} }]
 *   src/seeders/data/adp_financial_records.json
 *                                          [{ uid, adpFiscalYear, genSerialNoThisEdition,
 *                                             estimatedCost, priorActualExpenditure,
 *                                             revisedAllocation{total,fpa},
 *                                             revisedAllocationFiscalYear,
 *                                             estimatedExpenditureThroughAllocationYear,
 *                                             throwForward,
 *                                             nextYearAllocation{capital,revenue,total,fpa},
 *                                             nextYearAllocationFiscalYear,
 *                                             financialProgressPercent{throughOutgoingFYJune,
 *                                                                      throughNextFYJune} }]
 *
 * Every write is an upsert keyed on a natural key (department name, scheme uid,
 * {schemeId, adpFiscalYear}), so the script is safe to rerun. Nothing is
 * fabricated here: rows absent from the JSON are never invented, and the JSON
 * carries a page reference back to the printed book for every scheme.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const {
	Department,
	SubSector,
	District,
	Scheme,
	AdpFinancialRecord,
	User,
} = require("../models");
const logger = require("../utils/logger");

const DATA_DIR = path.join(__dirname, "data");
const ADP_FISCAL_YEAR = "2026-2027";

function readJson(file) {
	const p = path.join(DATA_DIR, file);
	if (!fs.existsSync(p)) throw new Error(`Missing extraction file: ${p} (run scratch/parse_adp.py first)`);
	return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function systemImporterUser() {
	const email = "adp-importer@system.local";
	let u = await User.findOne({ email });
	if (!u) {
		u = await User.create({
			name: "ADP Ledger Importer",
			email,
			passwordHash: "x", // non-login system account
			role: "pd_mec_central",
			isActive: false,
		});
	}
	return u;
}

async function importDepartments(rows) {
	const map = new Map();
	for (const d of rows) {
		const doc = await Department.findOneAndUpdate(
			{ name: d.name },
			{ $set: { adpSerialNo: d.adpSerialNo, type: d.type || "department" } },
			{ new: true, upsert: true },
		);
		map.set(d.name, doc._id);
	}
	logger.info(`departments: ${map.size}`);
	return map;
}

async function importSubSectors(rows, deptMap) {
	const map = new Map(); // `${department}||${name}` -> _id
	for (const s of rows) {
		const departmentId = deptMap.get(s.department);
		if (!departmentId) {
			logger.warn(`subSector "${s.name}" references unknown department "${s.department}" - skipped`);
			continue;
		}
		const doc = await SubSector.findOneAndUpdate(
			{ departmentId, name: s.name },
			{ $setOnInsert: { departmentId, name: s.name } },
			{ new: true, upsert: true },
		);
		map.set(`${s.department}||${s.name}`, doc._id);
	}
	logger.info(`subSectors: ${map.size}`);
	return map;
}

async function importDistricts(schemeRows) {
	const names = new Set();
	for (const s of schemeRows) (s.districts || []).forEach((n) => names.add(n));
	const map = new Map();
	for (const name of names) {
		const doc = await District.findOneAndUpdate(
			{ name },
			{ $setOnInsert: { name } },
			{ new: true, upsert: true },
		);
		map.set(name, doc._id);
	}
	logger.info(`districts: ${map.size}`);
	return map;
}

async function importSchemes(rows, deptMap, subMap, distMap, createdBy) {
	let upserts = 0;
	const uidToId = new Map();
	for (const s of rows) {
		const departmentId = deptMap.get(s.department);
		const subSectorId = subMap.get(`${s.department}||${s.subSector}`);
		if (!departmentId || !subSectorId) {
			logger.warn(`scheme ${s.uid}: unresolved department/subSector (${s.department} / ${s.subSector}) - skipped`);
			continue;
		}
		const districtIds = (s.districts || []).map((n) => distMap.get(n)).filter(Boolean);
		const set = {
			genSerialNo: s.genSerialNo,
			name: s.name,
			departmentId,
			subSectorId,
			districtIds,
			provinceWide: !!s.provinceWide,
			adpApproval: {
				status: s.adpApproval.status,
				approvalDate: s.adpApproval.approvalDate ? new Date(s.adpApproval.approvalDate) : undefined,
				underRevision: !!s.adpApproval.underRevision,
			},
			schemeCategory: s.schemeCategory,
			targetCompletionDate: s.targetCompletionDate ? new Date(s.targetCompletionDate) : undefined,
			estimatedCost: s.estimatedCost,
			qrCodeUrl: s.qrCodeUrl || undefined,
			sourceEdition: {
				adpVolume: "Volume V",
				fiscalYear: ADP_FISCAL_YEAR,
				pageFrom: s.sourceEdition && s.sourceEdition.page,
				pageTo: s.sourceEdition && s.sourceEdition.page,
			},
		};
		const doc = await Scheme.findOneAndUpdate(
			{ uid: s.uid },
			{ $set: set, $setOnInsert: { uid: s.uid, createdBy } },
			{ new: true, upsert: true },
		);
		uidToId.set(s.uid, doc._id);
		upserts += 1;
	}
	logger.info(`schemes upserted: ${upserts}`);
	return uidToId;
}

async function importFinancialRecords(rows, uidToId) {
	let upserts = 0;
	for (const r of rows) {
		const schemeId = uidToId.get(r.uid);
		if (!schemeId) {
			logger.warn(`financial record for ${r.uid}: no matching scheme - skipped`);
			continue;
		}
		const set = {
			genSerialNoThisEdition: r.genSerialNoThisEdition,
			estimatedCost: r.estimatedCost,
			priorActualExpenditure: r.priorActualExpenditure,
			priorActualExpenditureAsOf: r.priorActualExpenditureAsOf
				? new Date(r.priorActualExpenditureAsOf)
				: undefined,
			revisedAllocation: r.revisedAllocation,
			revisedAllocationFiscalYear: r.revisedAllocationFiscalYear,
			estimatedExpenditureThroughAllocationYear: r.estimatedExpenditureThroughAllocationYear,
			throwForward: r.throwForward,
			throwForwardAsOf: r.throwForwardAsOf ? new Date(r.throwForwardAsOf) : undefined,
			nextYearAllocation: r.nextYearAllocation,
			nextYearAllocationFiscalYear: r.nextYearAllocationFiscalYear,
			financialProgressPercent: r.financialProgressPercent,
		};
		await AdpFinancialRecord.findOneAndUpdate(
			{ schemeId, adpFiscalYear: r.adpFiscalYear || ADP_FISCAL_YEAR },
			{ $set: set, $setOnInsert: { schemeId, adpFiscalYear: r.adpFiscalYear || ADP_FISCAL_YEAR } },
			{ new: true, upsert: true },
		);
		upserts += 1;
	}
	logger.info(`financial records upserted: ${upserts}`);
}

async function run() {
	const departments = readJson("adp_departments.json");
	const subsectors = readJson("adp_subsectors.json");
	const schemes = readJson("adp_schemes.json");
	const financial = readJson("adp_financial_records.json");

	const importer = await systemImporterUser();
	const deptMap = await importDepartments(departments);
	const subMap = await importSubSectors(subsectors, deptMap);
	const distMap = await importDistricts(schemes);
	const uidToId = await importSchemes(schemes, deptMap, subMap, distMap, importer._id);
	await importFinancialRecords(financial, uidToId);

	const [dCount, ssCount, sCount, fCount] = await Promise.all([
		Department.countDocuments(),
		SubSector.countDocuments(),
		Scheme.countDocuments(),
		AdpFinancialRecord.countDocuments(),
	]);
	logger.info(
		`DB now holds: ${dCount} departments, ${ssCount} sub-sectors, ${sCount} schemes, ${fCount} financial records`,
	);
}

module.exports = { run };

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
