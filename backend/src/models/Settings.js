const mongoose = require("mongoose");

// Single-document collection holding configurable policy values so the
// geofence radius and variance thresholds are not hardcoded constants.
const settingsSchema = new mongoose.Schema(
	{
		key: { type: String, required: true, unique: true, default: "global" },
		geofenceRadiusMeters: { type: Number, default: 50 },
		// Variance classification bands (absolute % variance index).
		varianceYellowThreshold: { type: Number, default: 10 }, // <= this => normal
		varianceRedThreshold: { type: Number, default: 25 }, // <= this => yellow, above => red
	},
	{ timestamps: true, collection: "settings" },
);

settingsSchema.statics.getGlobal = async function getGlobal() {
	return this.findOneAndUpdate(
		{ key: "global" },
		{ $setOnInsert: { key: "global" } },
		{ new: true, upsert: true },
	);
};

module.exports = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
