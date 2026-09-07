const express = require("express");

const authRoutes = require("./auth.routes");
const schemeRoutes = require("./scheme.routes");
const monitoring = require("../controllers/monitoring.controller");
const dashboard = require("../controllers/dashboard.controller");
const audit = require("../controllers/audit.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/schemes", schemeRoutes);

// Director General review queue (not scheme-scoped).
router.get("/monitoring/pending", authenticate, requireRole("director_general"), monitoring.pendingQueue);

// Dashboards.
router.get("/dashboard/dg", authenticate, requireRole("director_general", "pd_mec_central"), dashboard.dg);
router.get("/dashboard/variance-by-department", authenticate, dashboard.varianceByDepartment);
router.get("/dashboard/region-workload", authenticate, dashboard.regionWorkload);
router.get("/dashboard/red-flags", authenticate, dashboard.redFlags);

// Audit log viewer.
router.get("/audit-logs", authenticate, requireRole("pd_mec_central", "director_general"), audit.list);

module.exports = router;
