const request = require("supertest");
const app = require("../src/app");
const { makeUser, makeScheme, addFinancialRecord, auth } = require("./helpers");

async function approveScheme(base, rd, dg) {
	await request(app).post(`${base}/monitoring/submit`).set(auth(rd.token)).send({});
	await request(app)
		.post(`${base}/monitoring/decision`)
		.set(auth(dg.token))
		.send({ decision: "approve" });
}

describe("team assembly gating", () => {
	it("is blocked on a non-approved scheme and allowed once approved", async () => {
		const rd = await makeUser("regional_director");
		const dg = await makeUser("director_general");
		const meo = await makeUser("meo");
		const scheme = await makeScheme(rd.user._id);
		const base = `/api/schemes/${scheme._id}`;

		let res = await request(app)
			.post(`${base}/team`)
			.set(auth(rd.token))
			.send({ members: [{ userId: meo.user._id, roleInTeam: "meo" }] });
		expect(res.status).toBe(409);

		await approveScheme(base, rd, dg);

		res = await request(app)
			.post(`${base}/team`)
			.set(auth(rd.token))
			.send({ members: [{ userId: meo.user._id, roleInTeam: "meo" }] });
		expect(res.status).toBe(201);
		expect(res.body.data.members).toHaveLength(1);
	});
});

describe("inspection eligibility + variance", () => {
	it("rejects an MEO not on the active team", async () => {
		const rd = await makeUser("regional_director");
		const dg = await makeUser("director_general");
		const onTeam = await makeUser("meo");
		const offTeam = await makeUser("meo");
		const scheme = await makeScheme(rd.user._id);
		const base = `/api/schemes/${scheme._id}`;
		await approveScheme(base, rd, dg);
		await request(app)
			.post(`${base}/team`)
			.set(auth(rd.token))
			.send({ members: [{ userId: onTeam.user._id, roleInTeam: "meo" }] });

		const body = {
			inspectionDate: new Date().toISOString(),
			gpsAtInspection: { type: "Point", coordinates: [67, 25] },
			milestoneUpdates: [],
		};
		const res = await request(app)
			.post(`${base}/inspections`)
			.set(auth(offTeam.token))
			.send(body);
		expect(res.status).toBe(403);
	});

	it("creates a variance record with the right classification after an inspection", async () => {
		const rd = await makeUser("regional_director");
		const dg = await makeUser("director_general");
		const meo = await makeUser("meo");
		const scheme = await makeScheme(rd.user._id);
		const base = `/api/schemes/${scheme._id}`;
		await approveScheme(base, rd, dg);
		await request(app)
			.post(`${base}/team`)
			.set(auth(rd.token))
			.send({ members: [{ userId: meo.user._id, roleInTeam: "meo" }] });

		// financial expenditure 60% of estimatedCost
		await addFinancialRecord(scheme._id, 600);

		const m = scheme.milestones;
		// Push milestone A to 100% -> weighted physical progress = 50%
		const res = await request(app)
			.post(`${base}/inspections`)
			.set(auth(meo.token))
			.send({
				inspectionDate: new Date().toISOString(),
				gpsAtInspection: { type: "Point", coordinates: [67, 25] },
				milestoneUpdates: [{ milestoneId: m[0]._id, completionPercent: 100 }],
			});
		expect(res.status).toBe(201);
		// 60 (financial) - 50 (physical) = 10 -> normal (<= 10)
		expect(res.body.data.variance.physicalProgressPercent).toBe(50);
		expect(res.body.data.variance.financialExpenditurePercent).toBe(60);
		expect(res.body.data.variance.classification).toBe("normal");
	});

	it("classifies a >25 gap as red and triggers an alert", async () => {
		const rd = await makeUser("regional_director");
		const dg = await makeUser("director_general");
		const meo = await makeUser("meo");
		const scheme = await makeScheme(rd.user._id);
		const base = `/api/schemes/${scheme._id}`;
		await approveScheme(base, rd, dg);
		await request(app)
			.post(`${base}/team`)
			.set(auth(rd.token))
			.send({ members: [{ userId: meo.user._id, roleInTeam: "meo" }] });
		await addFinancialRecord(scheme._id, 900); // 90% financial

		const res = await request(app)
			.post(`${base}/inspections`)
			.set(auth(meo.token))
			.send({
				inspectionDate: new Date().toISOString(),
				gpsAtInspection: { type: "Point", coordinates: [67, 25] },
				milestoneUpdates: [{ milestoneId: scheme.milestones[0]._id, completionPercent: 20 }],
			});
		expect(res.status).toBe(201);
		// physical = 0.5*20 = 10; 90 - 10 = 80 -> red
		expect(res.body.data.variance.classification).toBe("red");
		expect(res.body.data.variance.triggeredAlert).toBe(true);
	});
});
