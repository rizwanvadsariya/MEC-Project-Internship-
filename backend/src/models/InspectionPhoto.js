const mongoose = require("mongoose");
const { pointSchema } = require("./common");
const schema = new mongoose.Schema({
	inspectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Inspection", required: true },
	fileUrl: { type: String, required: true }, thumbnailUrl: String,
	capturedAt: { type: Date, required: true }, gps: { type: pointSchema, required: true },
	watermarkData: { schemeUid: String, schemeName: String, latitude: Number, longitude: Number, timestamp: Date, meoId: String },
	checksumSha256: { type: String, required: true },
}, { timestamps: true, collection: "inspectionPhotos" });
schema.index({ inspectionId: 1 });
module.exports = mongoose.models.InspectionPhoto || mongoose.model("InspectionPhoto", schema);
