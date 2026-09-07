const request = require("supertest");
const app = require("../src/app");
const { makeUser, makeScheme, auth } = require("./helpers");

describe("scheme edit lock", () => {
	it("allows edits while draft, blocks while pending, allows again after rejection", async () => {
		const rd = await makeUser("regional_director");
		const dg = await makeUser("director_general");
		const scheme = await makeScheme(rd.user._id);
		const base = `/api/schemes/${scheme._id}`;

		// draft
		let res = await request(app).patch(base).set(auth(rd.token)).send({ name: "Edit 1" });
		expect(res.status).toBe(200);

		// pending -> locked
		await request(app).post(`${base}/monitoring/submit`).set(auth(rd.token)).send({});
		res = await request(app).patch(base).set(auth(rd.token)).send({ name: "Edit 2" });
		expect(res.status).toBe(409);

		// rejected -> unlocked
		await request(app)
			.post(`${base}/monitoring/decision`)
			.set(auth(dg.token))
			.send({ decision: "reject", rejectionReason: "needs work" });
		res = await request(app).patch(base).set(auth(rd.token)).send({ name: "Edit 3" });
		expect(res.status).toBe(200);
	});
});
