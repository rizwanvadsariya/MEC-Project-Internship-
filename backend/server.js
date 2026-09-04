require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const app = require("./src/app");
const { connectDatabase } = require("./src/config/db");

const port = Number(process.env.PORT || 5000);

async function startServer() {
	try {
		await connectDatabase();
		app.listen(port, () => console.log(`API listening on port ${port}`));
	} catch (error) {
		console.error(`Unable to start backend: ${error.message}`);
		process.exitCode = 1;
	}
}

startServer();
