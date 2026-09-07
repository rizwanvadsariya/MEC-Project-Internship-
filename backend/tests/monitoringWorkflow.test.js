const request = require("supertest");
const app = require("../src/app");
const { SchemeMonitoringApproval } = require("../src/models");
const { makeUser, makeScheme, auth } = require("./helpers");

describe("monitoring approval: submit -> reject -> revise -> resubmit -> approve", () => {
	it("runs the full loop and chains revisionOf", async () => {
		const rd = await makeUser("regional_director");
		const dg = await makeUser("director_general");
		const scheme = await makeScheme(rd.user._id);
		const base = `/api/schemes/${scheme._id}`;

		// draft -> pending
		let res = await request(app).post(`${base}/monitoring/submit`).set(auth(rd.token)).send({});
		expect(res.status).toBe(201);
		expect(res.body.data.status).toBe("pending");
		const firstId = res.body.data._id;

		// reject requires a non-empty reason
		res = await request(app)
			.post(`${base}/monitoring/decision`)
			.set(auth(dg.token))
			.send({ decision: "reject", rejectionReason: "   " });
		expect(res.status).toBe(422);

		res = await request(app)
			.post(`${base}/monitoring/decision`)
			.set(auth(dg.token))
			.send({ decision: "reject", rejectionReason: "Milestones missing weights" });
		expect(res.status).toBe(200);
		expect(res.body.data.status).toBe("rejected");

		// RD revises the (now editable) scheme
		res = await request(app).patch(base).set(auth(rd.token)).send({ name: "Revised name" });
		expect(res.status).toBe(200);

		// resubmit -> new doc pointing back via revisionOf
		res = await request(app).post(`${base}/monitoring/submit`).set(auth(rd.token)).send({});
		expect(res.status).toBe(201);
		expect(String(res.body.data.revisionOf)).toBe(String(firstId));

		// approve
		res = await request(app)
			.post(`${base}/monitoring/decision`)
			.set(auth(dg.token))
			.send({ decision: "approve" });
		expect(res.status).toBe(200);
		expect(res.body.data.status).toBe("approved");

		// derived state is approved; history has 2 cycles
		res = await request(app).get(`${base}/monitoring/history`).set(auth(rd.token));
		expect(res.body.data.monitoringState).toBe("approved");
		expect(await SchemeMonitoringApproval.countDocuments({ schemeId: scheme._id })).toBe(2);
	});

	it("blocks a second submit while one is pending", async () => {
		const rd = await makeUser("regional_director");
		const scheme = await makeScheme(rd.user._id);
		const base = `/api/schemes/${scheme._id}`;
		await request(app).post(`${base}/monitoring/submit`).set(auth(rd.token)).send({});
		const res = await request(app).post(`${base}/monitoring/submit`).set(auth(rd.token)).send({});
		expect(res.status).toBe(409);
	});
});
