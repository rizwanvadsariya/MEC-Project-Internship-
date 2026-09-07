const express = require("express");

const scheme = require("../controllers/scheme.controller");
const monitoring = require("../controllers/monitoring.controller");
const team = require("../controllers/team.controller");
const inspection = require("../controllers/inspection.controller");
const financial = require("../controllers/financial.controller");
const variance = require("../controllers/variance.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");
const loadScheme = require("../middlewares/loadScheme.middleware");
const editLock = require("../middlewares/schemeEditLock.middleware");
const teamEligibility = require("../middlewares/teamEligibility.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { submissionRateLimiter } = require("../middlewares/rateLimit.middleware");
const v = require("../validators");

const router = express.Router();
router.use(authenticate);

// --- Scheme registry -------------------------------------------------------
router.get("/", scheme.list);
router.post("/", requireRole("regional_director"), validate(v.createScheme), scheme.create);
router.get("/:schemeId", loadScheme, scheme.getOne);
router.patch(
	"/:schemeId",
	requireRole("regional_director"),
	loadScheme,
	editLock, // blocks unless derived monitoring state is draft | rejected
	scheme.update,
);
router.get("/:schemeId/edit-history", loadScheme, scheme.editHistory);

// --- Monitoring approval workflow ---------------------------------------
router.post(
	"/:schemeId/monitoring/submit",
	requireRole("regional_director"),
	submissionRateLimiter,
	loadScheme,
	validate(v.submitForMonitoring),
	monitoring.submit,
);
router.post(
	"/:schemeId/monitoring/decision",
	requireRole("director_general"),
	loadScheme,
	validate(v.decideMonitoring),
	monitoring.decide,
);
router.get("/:schemeId/monitoring/history", loadScheme, monitoring.history);

// --- Team assembly -------------------------------------------------------
router.post(
	"/:schemeId/team",
	requireRole("regional_director"),
	loadScheme,
	validate(v.assembleTeam),
	team.assemble,
);
router.get("/:schemeId/team", loadScheme, team.get);
router.post("/:schemeId/team/members", requireRole("regional_director"), loadScheme, team.addMember);
router.delete(
	"/:schemeId/team/members/:userId",
	requireRole("regional_director"),
	loadScheme,
	team.removeMember,
);
router.delete("/:schemeId/team", requireRole("regional_director"), loadScheme, team.disband);

// --- Inspections (MEO, must be on the active team) ---------------------
router.post(
	"/:schemeId/inspections",
	requireRole("meo"),
	loadScheme,
	teamEligibility,
	validate(v.createInspection),
	inspection.create,
);
router.get("/:schemeId/inspections", loadScheme, inspection.listForScheme);

// --- ADP financial records (time series) -----------------------------
router.post(
	"/:schemeId/financial-records",
	requireRole("pd_mec_central", "line_department_head"),
	loadScheme,
	validate(v.createFinancialRecord),
	financial.create,
);
router.get("/:schemeId/financial-records", loadScheme, financial.listForScheme);

// --- Variance ----------------------------------------------------------
router.get("/:schemeId/variance", loadScheme, variance.listForScheme);
router.post(
	"/:schemeId/variance/recompute",
	requireRole("pd_mec_central"),
	loadScheme,
	variance.recompute,
);

module.exports = router;
