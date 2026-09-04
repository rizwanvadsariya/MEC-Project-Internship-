const mongoose = require("mongoose");
const models = require("../models");

async function connectDatabase() {
	const mongoUri = process.env.MONGO_URI || process.env.MONGO_ATLAS_URI;
	if (!mongoUri) throw new Error("MONGO_URI or MONGO_ATLAS_URI is not configured");

	await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
	await Promise.all(Object.values(models).map((model) => model.createCollection()));
	console.log(`MongoDB connected: ${mongoose.connection.name}`);
	console.log(`MongoDB collections ready: ${Object.values(models).length}`);
}

async function disconnectDatabase() {
	await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
