const { SchemeMonitoringApproval, Scheme, Team, VarianceRecord } = require("../models");
const { ok } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

// GET /dashboard/dg  - Director General overview
const dg = asyncHandler(async (req, res) => {
	const [pendingApprovals, redFlags] = await Promise.all([
		SchemeMonitoringApproval.countDocuments({ status: "pending" }),
		Scheme.countDocuments({ varianceClassification: "red" }),
	]);
	return ok(res, { pendingApprovals, redFlagSchemes: redFlags });
});

// GET /dashboard/variance-by-department
const varianceByDepartment = asyncHandler(async (req, res) => {
	const rows = await Scheme.aggregate([
		{ $match: { varianceClassification: { $ne: null } } },
		{
			$group: {
				_id: { departmentId: "$departmentId", classification: "$varianceClassification" },
				count: { $sum: 1 },
			},
		},
		{
			$group: {
				_id: "$_id.departmentId",
				buckets: { $push: { classification: "$_id.classification", count: "$count" } },
				total: { $sum: "$count" },
			},
		},
	]);
	return ok(res, rows);
});

// GET /dashboard/region-workload
const regionWorkload = asyncHandler(async (req, res) => {
	const rows = await Team.aggregate([
		{ $match: { status: "active" } },
		{ $unwind: "$members" },
		{ $match: { "members.removedAt": null } },
		{ $group: { _id: "$members.userId", teams: { $addToSet: "$_id" } } },
		{ $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
		{ $unwind: "$user" },
		{
			$group: {
				_id: "$user.region",
				meoCount: { $sum: 1 },
				teamCount: { $sum: { $size: "$teams" } },
			},
		},
	]);
	return ok(res, rows);
});

// GET /dashboard/red-flags
const redFlags = asyncHandler(async (req, res) => {
	const rows = await VarianceRecord.aggregate([
		{ $sort: { calculatedAt: -1 } },
		{ $group: { _id: "$schemeId", latest: { $first: "$$ROOT" } } },
		{ $match: { "latest.classification": "red" } },
	]);
	return ok(res, { count: rows.length, items: rows });
});

module.exports = { dg, varianceByDepartment, regionWorkload, redFlags };
