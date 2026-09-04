const User = require("./User");
const { Sector, Department, Division, District, Contractor } = require("./referenceModels");
const Scheme = require("./Scheme");
const SchemeDocument = require("./SchemeDocument");
const InspectionAssignment = require("./InspectionAssignment");
const Inspection = require("./Inspection");
const InspectionPhoto = require("./InspectionPhoto");
const Issue = require("./Issue");
const FinancialTransaction = require("./FinancialRecord");
const VarianceRecord = require("./VarianceRecord");
const Notification = require("./Notification");
const AuditLog = require("./AuditLog");

module.exports = {
  User, Sector, Department, Division, District, Contractor, Scheme, SchemeDocument,
  InspectionAssignment, Inspection, InspectionPhoto, Issue, FinancialTransaction,
  VarianceRecord, Notification, AuditLog,
};
