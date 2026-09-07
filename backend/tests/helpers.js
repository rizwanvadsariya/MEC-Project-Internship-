const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { User, Department, SubSector, Scheme, AdpFinancialRecord } = require("../src/models");
const { signToken } = require("../src/middlewares/auth.middleware");

async function makeUser(role, extra = {}) {
	const user = await User.create({
		name: `${role}-user`,
		email: `${role}.${Math.random().toString(36).slice(2)}@example.com`,
		passwordHash: await bcrypt.hash("pw", 4),
		role,
		...extra,
	});
	return { user, token: signToken(user) };
}

async function makeScheme(createdBy, overrides = {}) {
	const dept = await Department.create({ name: `Dept ${Math.random()}`, type: "department" });
	const sub = await SubSector.create({ departmentId: dept._id, name: "Sub" });
	return Scheme.create({
		uid: overrides.uid || `TSTSS-PP-25-${Math.floor(Math.random() * 9000 + 1000)}`,
		name: "Test scheme",
		departmentId: dept._id,
		subSectorId: sub._id,
		provinceWide: true,
		adpApproval: { status: "approved", approvalDate: new Date() },
		schemeCategory: "on_going",
		estimatedCost: 1000,
		milestones: [
			{ name: "A", weightPercent: 50, currentCompletionPercent: 0 },
			{ name: "B", weightPercent: 50, currentCompletionPercent: 0 },
		],
		createdBy,
		...overrides,
	});
}

async function addFinancialRecord(schemeId, expenditureThrough) {
	return AdpFinancialRecord.create({
		schemeId,
		adpFiscalYear: "2026-2027",
		estimatedCost: 1000,
		priorActualExpenditure: 0,
		revisedAllocation: { total: 100, fpa: 0 },
		revisedAllocationFiscalYear: "2025-2026",
		estimatedExpenditureThroughAllocationYear: expenditureThrough,
		throwForward: 0,
		nextYearAllocation: { capital: 0, revenue: 100, total: 100, fpa: 0 },
		nextYearAllocationFiscalYear: "2026-2027",
	});
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const oid = () => new mongoose.Types.ObjectId();

module.exports = { makeUser, makeScheme, addFinancialRecord, auth, oid };
