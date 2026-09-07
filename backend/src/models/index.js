const User = require("./User");
const { Department, SubSector, District, Contractor } = require("./referenceModels");
const Scheme = require("./Scheme");
const AdpFinancialRecord = require("./AdpFinancialRecord");
const SchemeMonitoringApproval = require("./SchemeMonitoringApproval");
const Team = require("./Team");
const SchemeDocument = require("./SchemeDocument");
const Inspection = require("./Inspection");
const InspectionPhoto = require("./InspectionPhoto");
const Issue = require("./Issue");
const VarianceRecord = require("./VarianceRecord");
const Notification = require("./Notification");
const AuditLog = require("./AuditLog");
const Settings = require("./Settings");
const SchemeEditHistory = require("./SchemeEditHistory");

module.exports = {
  User,
  Department,
  SubSector,
  District,
  Contractor,
  Scheme,
  AdpFinancialRecord,
  SchemeMonitoringApproval,
  Team,
  SchemeDocument,
  Inspection,
  InspectionPhoto,
  Issue,
  VarianceRecord,
  Notification,
  AuditLog,
  Settings,
  SchemeEditHistory,
};
