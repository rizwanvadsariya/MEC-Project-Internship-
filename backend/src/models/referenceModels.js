const mongoose = require("mongoose");

function simpleReferenceModel(name, collection, fields) {
  const schema = new mongoose.Schema(fields, { timestamps: true, collection });
  schema.index({ name: 1 }, { unique: true });
  return mongoose.models[name] || mongoose.model(name, schema);
}

const Sector = simpleReferenceModel("Sector", "sectors", {
  name: { type: String, required: true, trim: true },
  code: String,
});

const Department = simpleReferenceModel("Department", "departments", {
  name: { type: String, required: true, trim: true },
  code: String,
  sectorId: { type: mongoose.Schema.Types.ObjectId, ref: "Sector" },
});

const Division = simpleReferenceModel("Division", "divisions", {
  name: { type: String, required: true, trim: true },
  code: String,
});

const District = simpleReferenceModel("District", "districts", {
  name: { type: String, required: true, trim: true },
  code: String,
  divisionId: { type: mongoose.Schema.Types.ObjectId, ref: "Division", required: true },
});
District.schema.index({ name: 1, divisionId: 1 }, { unique: true });

const Contractor = simpleReferenceModel("Contractor", "contractors", {
  name: { type: String, required: true, trim: true },
  licenseNumber: String,
  contactPerson: String,
  phone: String,
  email: String,
  address: String,
});

module.exports = { Sector, Department, Division, District, Contractor };
