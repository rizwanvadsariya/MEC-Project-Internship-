const { Scheme, SchemeEditHistory } = require("../models");
const { ok, created } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const approvalService = require("../services/approvalService");
const audit = require("../services/auditService");

const EDITABLE_FIELDS = [
	"name",
	"genSerialNo",
	"departmentId",
	"subSectorId",
	"districtIds",
	"provinceWide",
	"adpApproval",
	"schemeCategory",
	"targetCompletionDate",
	"estimatedCost",
	"qrCodeUrl",
	"sourceEdition",
	"location",
	"milestones",
	"contractorId",
];

const list = asyncHandler(async (req, res) => {
	const { departmentId, subSectorId, districtId, varianceClassification, page = 1, limit = 25 } = req.query;
	const q = {};
	if (departmentId) q.departmentId = departmentId;
	if (subSectorId) q.subSectorId = subSectorId;
	if (districtId) q.districtIds = districtId;
	if (varianceClassification) q.varianceClassification = varianceClassification;
	const docs = await Scheme.find(q)
		.sort({ createdAt: -1 })
		.skip((Number(page) - 1) * Number(limit))
		.limit(Number(limit));
	const total = await Scheme.countDocuments(q);
	return ok(res, { total, page: Number(page), limit: Number(limit), items: docs });
});

const getOne = asyncHandler(async (req, res) => {
	const state = await approvalService.getMonitoringState(req.scheme._id);
	return ok(res, { scheme: req.scheme, monitoringState: state });
});

const create = asyncHandler(async (req, res) => {
	const payload = { ...req.validated, createdBy: req.user._id };
	const scheme = await Scheme.create(payload);
	await audit.record({
		userId: req.user._id,
		action: "scheme_created",
		entityType: "Scheme",
		entityId: scheme._id,
		ipAddress: req.ip,
	});
	return created(res, scheme);
});

// Edit is gated by loadScheme + schemeEditLock middleware in the route.
const update = asyncHandler(async (req, res) => {
	const scheme = req.scheme;
	const changes = {};
	for (const field of EDITABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(req.body, field)) {
			changes[field] = { from: scheme[field], to: req.body[field] };
			scheme[field] = req.body[field];
		}
	}
	await scheme.save();
	if (Object.keys(changes).length) {
		await SchemeEditHistory.create({ schemeId: scheme._id, editedBy: req.user._id, changes });
		await audit.record({
			userId: req.user._id,
			action: "scheme_edited",
			entityType: "Scheme",
			entityId: scheme._id,
			changes,
			ipAddress: req.ip,
		});
	}
	return ok(res, scheme);
});

const editHistory = asyncHandler(async (req, res) => {
	const rows = await SchemeEditHistory.find({ schemeId: req.scheme._id })
		.sort({ createdAt: -1 })
		.populate("editedBy", "name role");
	return ok(res, rows);
});

module.exports = { list, getOne, create, update, editHistory };
