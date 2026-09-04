const mongoose = require("mongoose");
const schema = new mongoose.Schema({
	schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
	documentType: { type: String, enum: ["pc1", "administrative_approval", "technical_sanction", "engineering_drawing", "revised_timeline", "revision_request", "other"], required: true },
	title: String, fileUrl: { type: String, required: true }, fileType: String,
	version: { type: Number, default: 1, min: 1 },
	uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	uploadedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: "schemeDocuments" });
schema.index({ schemeId: 1, documentType: 1 });
module.exports = mongoose.models.SchemeDocument || mongoose.model("SchemeDocument", schema);
