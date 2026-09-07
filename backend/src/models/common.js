const { Schema } = require("mongoose");

// System-wide user roles. `meo` replaces the former `fmo`; `director_general`
// is new and sits above regional_director for monitoring-approval authority.
const roles = [
  "pd_mec_central",
  "director_general",
  "line_department_head",
  "regional_director",
  "meo",
];

const monitoringApprovalStatuses = ["pending", "approved", "rejected"];

// Derived scheme-level monitoring state (never persisted on the scheme itself).
const monitoringStates = ["draft", "pending", "approved", "rejected"];

const varianceClassifications = ["normal", "yellow", "red"];

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], required: true, default: "Point" },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: "GeoJSON points require [longitude, latitude] coordinates",
      },
    },
  },
  { _id: false },
);

module.exports = {
  roles,
  monitoringApprovalStatuses,
  monitoringStates,
  varianceClassifications,
  pointSchema,
};
