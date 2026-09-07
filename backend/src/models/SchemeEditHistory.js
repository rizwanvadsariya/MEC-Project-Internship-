const mongoose = require("mongoose");

// Lightweight edit-history log on schemes, separate from the approval history,
// so a Director General can see exactly what a Regional Director changed
// between a rejection and a resubmission.
const schemeEditHistorySchema = new mongoose.Schema(
	{
		schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
		editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		changes: mongoose.Schema.Types.Mixed, // { field: { from, to } }
	},
	{ timestamps: true, collection: "schemeEditHistory" },
);

schemeEditHistorySchema.index({ schemeId: 1, createdAt: -1 });

module.exports =
	mongoose.models.SchemeEditHistory ||
	mongoose.model("SchemeEditHistory", schemeEditHistorySchema);
