/**
 * Pure-logic tests for src/kpi/buildKpiDashboard.ts (phases.md Step 34) — no
 * rendering, no network, matching this project's established tests/unit/
 * precedent. Fake `t` just echoes the key (with interpolation data appended
 * when present) so assertions can check exactly which translation key each
 * card used, the same fake-t style dateTime.test.ts already established.
 */
import { buildProvinceOverviewCards, buildDivisionKpiCards, buildMemberKpiCards, type KpiCard } from '../../../src/kpi/buildKpiDashboard';
import type { AnomaliesSummary, DivisionDashboard, MemberDashboard } from '../../../src/api/dashboard.api';
import type { MapDivisionSummary } from '../../../src/api/map.api';

const fakeT = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key);

function cardMap(cards: KpiCard[]): Record<string, KpiCard> {
	return Object.fromEntries(cards.map((card) => [card.key, card]));
}

describe('buildProvinceOverviewCards', () => {
	const divisions: MapDivisionSummary[] = [
		{ divisionId: 3, divisionName: 'Sukkur', schemesTotal: 100, schemesReported: 10, avgPhysicalProgressPct: 55.4 },
		{ divisionId: 1, divisionName: 'Karachi', schemesTotal: 786, schemesReported: 2, avgPhysicalProgressPct: 30 },
		{ divisionId: 2, divisionName: 'Hyderabad', schemesTotal: 50, schemesReported: 0, avgPhysicalProgressPct: null },
	];

	test('sorts divisions alphabetically by name, not by id/input order', () => {
		const cards = buildProvinceOverviewCards(divisions, fakeT);
		expect(cards.map((c) => c.label)).toEqual(['Hyderabad', 'Karachi', 'Sukkur']);
	});

	test('rounds a real average progress percentage', () => {
		const cards = buildProvinceOverviewCards(divisions, fakeT);
		const sukkur = cards.find((c) => c.label === 'Sukkur');
		expect(sukkur?.value).toBe('55%');
	});

	test('a division with no reported schemes renders the "not yet reported" key, never null/NaN%', () => {
		const cards = buildProvinceOverviewCards(divisions, fakeT);
		const hyderabad = cards.find((c) => c.label === 'Hyderabad');
		expect(hyderabad?.value).toBe('kpi.notYetReported');
	});

	test('every province card uses the default tone — this layer is informational, never alarmed', () => {
		const cards = buildProvinceOverviewCards(divisions, fakeT);
		expect(cards.every((c) => c.tone === 'default')).toBe(true);
	});

	test('an empty division list produces an empty card list, not a crash', () => {
		expect(buildProvinceOverviewCards([], fakeT)).toEqual([]);
	});

	test('does not mutate the input array (sorts a copy)', () => {
		const original = [...divisions];
		buildProvinceOverviewCards(divisions, fakeT);
		expect(divisions).toEqual(original);
	});
});

describe('buildDivisionKpiCards', () => {
	const summary: DivisionDashboard = {
		division: { id: 1, name: 'Karachi' },
		teams: { total: 5, byStatus: { DRAFT: 1, PENDING_APPROVAL: 1, APPROVED: 2, REJECTED: 1 } },
		visits: { total: 8, byStatus: { SCHEDULED: 2, IN_PROGRESS: 1, COMPLETED: 4, CANCELLED: 1 } },
		issues: { total: 6, open: 3, byStatus: { OPEN: 2, ACKNOWLEDGED: 1, IN_PROGRESS: 0, RESOLVED: 3 }, bySeverity: { LOW: 1, MEDIUM: 1, HIGH: 1, CRITICAL: 0 } },
		progressByDepartment: [],
		overallProgress: { avgProgressPct: 42.4, schemesReported: 9, schemesTotal: 20 },
		recentVisits: [],
		recentIssues: [],
	};

	const quietAnomalies: AnomaliesSummary = {
		noVisitThresholdMonths: 6,
		spendWithoutProgressThresholds: { financialMinPct: 50, physicalMaxPct: 10 },
		riskGapThresholdPct: 20,
		noRecentVisit: { total: 0, rows: [] },
		spendWithoutProgress: { total: 0, rows: [] },
		atRiskOfMissingTarget: { total: 0, rows: [] },
	};

	test('includes the real division numbers from the summary', () => {
		const cards = cardMap(buildDivisionKpiCards(summary, quietAnomalies, fakeT));
		expect(cards.overallProgress.value).toBe('42%');
		expect(cards.activeTeams.value).toBe('5');
		expect(cards.activeVisits.value).toBe('8');
		expect(cards.openIssues.value).toBe('3');
	});

	test('zero flagged anomalies render with the default tone, independent of the (non-zero in this fixture) open-issues count', () => {
		const cards = cardMap(buildDivisionKpiCards(summary, quietAnomalies, fakeT));
		expect(cards.noRecentVisit.tone).toBe('default');
		expect(cards.spendWithoutProgress.tone).toBe('default');
		expect(cards.atRisk.tone).toBe('default');
	});

	test('a non-zero anomaly/risk total gets the danger tone, independently per card', () => {
		const loudAnomalies: AnomaliesSummary = {
			...quietAnomalies,
			noRecentVisit: { total: 12, rows: [] },
			atRiskOfMissingTarget: { total: 2, rows: [] },
		};
		const cards = cardMap(buildDivisionKpiCards(summary, loudAnomalies, fakeT));
		expect(cards.noRecentVisit.value).toBe('12');
		expect(cards.noRecentVisit.tone).toBe('danger');
		expect(cards.atRisk.value).toBe('2');
		expect(cards.atRisk.tone).toBe('danger');
		// spendWithoutProgress stayed at 0 in loudAnomalies — must stay default.
		expect(cards.spendWithoutProgress.tone).toBe('default');
	});

	test('open issues > 0 gets the warning tone (less severe than an anomaly/risk flag, same footing as the existing Analytics screen treats it)', () => {
		const cards = cardMap(buildDivisionKpiCards(summary, quietAnomalies, fakeT));
		expect(cards.openIssues.tone).toBe('warning');
	});

	test('a division with no reported schemes yet renders "not yet reported", never null/NaN%', () => {
		const noProgressSummary: DivisionDashboard = { ...summary, overallProgress: { avgProgressPct: null, schemesReported: 0, schemesTotal: 20 } };
		const cards = cardMap(buildDivisionKpiCards(noProgressSummary, quietAnomalies, fakeT));
		expect(cards.overallProgress.value).toBe('kpi.notYetReported');
	});
});

describe('buildMemberKpiCards', () => {
	const summary: MemberDashboard = {
		visits: { total: 4, byStatus: { SCHEDULED: 1, IN_PROGRESS: 1, COMPLETED: 2, CANCELLED: 0 } },
		formsDue: 2,
		issues: { reportedByMe: 1, open: 3 },
		schemesMonitored: 5,
		recentVisits: [],
		recentIssues: [],
	};

	test('includes the real member numbers from the summary', () => {
		const cards = cardMap(buildMemberKpiCards(summary, fakeT));
		expect(cards.schemesMonitored.value).toBe('5');
		expect(cards.activeVisits.value).toBe('4');
		expect(cards.formsDue.value).toBe('2');
		expect(cards.openIssues.value).toBe('3');
	});

	test('formsDue === 0 (e.g. a SUPPORT_USER, who can never hold LEAD_MEO) renders the default tone', () => {
		const supportLikeSummary: MemberDashboard = { ...summary, formsDue: 0, issues: { reportedByMe: 0, open: 0 } };
		const cards = cardMap(buildMemberKpiCards(supportLikeSummary, fakeT));
		expect(cards.formsDue.tone).toBe('default');
		expect(cards.openIssues.tone).toBe('default');
	});

	test('formsDue > 0 gets the warning tone', () => {
		const cards = cardMap(buildMemberKpiCards(summary, fakeT));
		expect(cards.formsDue.tone).toBe('warning');
	});
});
