const mongoose = require("mongoose");

// -- departments -------------------------------------------------------------
// The ~45 government departments from the ADP index. The book uses "Sector"
// and "Department" interchangeably at this level, so there is no separate
// Sector collection. There is also no Division layer in the source data.
const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    adpSerialNo: Number,
    type: {
      type: String,
      required: true,
      enum: ["department", "block_allocation"],
      default: "department",
    },
  },
  { timestamps: true, collection: "departments" },
);

// -- subSectors ------------------------------------------------------------
const subSectorSchema = new mongoose.Schema(
  {
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: "subSectors" },
);
subSectorSchema.index({ departmentId: 1, name: 1 }, { unique: true });

// -- districts ----------------------------------------------------------------
const districtSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true, collection: "districts" },
);

// -- contractors ------------------------------------------------------------
const contractorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    licenseNumber: String,
    contactPerson: String,
    phone: String,
    email: String,
    address: String,
  },
  { timestamps: true, collection: "contractors" },
);

const Department = mongoose.models.Department || mongoose.model("Department", departmentSchema);
const SubSector = mongoose.models.SubSector || mongoose.model("SubSector", subSectorSchema);
const District = mongoose.models.District || mongoose.model("District", districtSchema);
const Contractor = mongoose.models.Contractor || mongoose.model("Contractor", contractorSchema);

module.exports = { Department, SubSector, District, Contractor };
