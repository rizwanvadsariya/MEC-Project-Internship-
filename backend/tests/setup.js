process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

beforeAll(async () => {
	mongod = await MongoMemoryServer.create();
	await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
	const { collections } = mongoose.connection;
	await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
	await mongoose.disconnect();
	if (mongod) await mongod.stop();
});
