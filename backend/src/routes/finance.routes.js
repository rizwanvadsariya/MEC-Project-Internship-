const express = require("express");
const { createTestFinancialRecord } = require("../controllers/finance.controller");

const router = express.Router();

router.post("/test-data/financial", createTestFinancialRecord);

module.exports = router;
