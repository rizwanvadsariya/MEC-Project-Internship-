const { Schema } = require("mongoose");

const roles = [
  "pd_mec_central",
  "line_department_head",
  "regional_director",
  "fmo",
];

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], required: true, default: "Point" },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) => value.length === 2,
        message: "GeoJSON points require [longitude, latitude] coordinates",
      },
    },
  },
  { _id: false },
);

module.exports = { roles, pointSchema };
