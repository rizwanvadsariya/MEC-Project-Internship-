/**
 * Pure-logic tests for src/export/divisionReport.ts (phases.md Step 29) —
 * no rendering, no Expo modules, matching this project's established
 * tests/unit/ precedent (see dateTime.test.ts).
 */
import { buildDivisionReport } from '../../../src/export/divisionReport';
import type { DivisionDashboard } from '../../../src/api/dashboard.api';

const fakeT = (key: string, options?: Record<string, unknown>) =>
	options ? `${key}:${JSON.stringify(options)}` : key;

const baseDashboard: DivisionDashboard = {
	division: { id: 1, name: 'Karachi' },
	teams: { total: 4, byStatus: { DRAFT: 1, PENDING_APPROVAL: 1, APPROVED: 2, REJECTED: 0 } },
	visits: { total: 3, byStatus: { SCHEDULED: 1, IN_PROGRESS: 1, COMPLETED: 1, CANCELLED: 0 } },
	issues: {
		total: 5,
		open: 3,
		byStatus: { OPEN: 2, ACKNOWLEDGED: 1, IN_PROGRESS: 0, RESOLVED: 2 },
		bySeverity: { LOW: 1, MEDIUM: 2, HIGH: 1, CRITICAL: 1 },
	},
	progressByDepartment: [
		{ departmentId: 1, departmentName: 'Agriculture', schemesTotal: 10, schemesReported: 4, avgProgressPct: 42.5 },
		{ departmentId: 2, departmentName: 'Health', schemesTotal: 6, schemesReported: 0, avgProgressPct: null },
	],
	overallProgress: { avgProgressPct: 38.2, schemesReported: 4, schemesTotal: 16 },
	recentVisits: [],
	recentIssues: [],
};

describe('buildDivisionReport', () => {
	test('title is built from the reportTitle translation key with the division name interpolated', () => {
		const report = buildDivisionReport(baseDashboard, fakeT);
		expect(report.title).toBe('analytics.export.reportTitle:{"division":"Karachi"}');
		expect(report.divisionName).toBe('Karachi');
	});

	test('generatedAtIso reflects the injected `now`, not the real clock', () => {
		const fixedNow = new Date('2026-03-10T12:00:00.000Z').getTime();
		const report = buildDivisionReport(baseDashboard, fakeT, fixedNow);
		expect(report.generatedAtIso).toBe('2026-03-10T12:00:00.000Z');
	});

	test('produces one section per department-progress/status-breakdown group, in on-screen order', () => {
		const report = buildDivisionReport(baseDashboard, fakeT);
		expect(report.sections).toHaveLength(6);
		expect(report.sections.map((s) => s.heading)).toEqual([
			'analytics.overallProgress',
			'analytics.progressByDepartment',
			'analytics.statusBreakdown — analytics.teams',
			'analytics.statusBreakdown — analytics.visits',
			'analytics.statusBreakdown — analytics.issues',
			'analytics.issuesBySeverity',
		]);
	});

	test('overall progress section rounds the percentage, matching AnalyticsScreen.tsx\'s own formatPct', () => {
		const report = buildDivisionReport(baseDashboard, fakeT);
		const overall = report.sections[0];
		expect(overall.rows[0]).toEqual({ label: 'analytics.overallProgress', value: '38%' });
	});

	test('a department with no reported schemes renders "not yet reported", never null/NaN%', () => {
		const report = buildDivisionReport(baseDashboard, fakeT);
		const departmentSection = report.sections[1];
		const health = departmentSection.rows.find((row) => row.label === 'Health');
		expect(health?.value).toContain('analytics.notYetReported');
		expect(health?.value).not.toContain('null');
		expect(health?.value).not.toContain('NaN');
	});

	test('an empty department list renders the noDepartments row instead of a blank section', () => {
		const emptyDashboard: DivisionDashboard = { ...baseDashboard, progressByDepartment: [] };
		const report = buildDivisionReport(emptyDashboard, fakeT);
		expect(report.sections[1].rows).toEqual([{ label: 'analytics.noDepartments', value: '' }]);
	});

	test('every status-breakdown row carries the real count from the dashboard, not a placeholder', () => {
		const report = buildDivisionReport(baseDashboard, fakeT);
		const teamsSection = report.sections[2];
		expect(teamsSection.rows).toEqual([
			{ label: 'analytics.teamStatus.DRAFT', value: '1' },
			{ label: 'analytics.teamStatus.PENDING_APPROVAL', value: '1' },
			{ label: 'analytics.teamStatus.APPROVED', value: '2' },
			{ label: 'analytics.teamStatus.REJECTED', value: '0' },
		]);
	});

	test('visit status rows reuse the shared siteVisits.status.* keys, not a duplicate namespace', () => {
		const report = buildDivisionReport(baseDashboard, fakeT);
		const visitsSection = report.sections[3];
		expect(visitsSection.rows.map((r) => r.label)).toEqual([
			'siteVisits.status.SCHEDULED',
			'siteVisits.status.IN_PROGRESS',
			'siteVisits.status.COMPLETED',
			'siteVisits.status.CANCELLED',
		]);
	});

	test('issue severity section carries the bySeverity counts', () => {
		const report = buildDivisionReport(baseDashboard, fakeT);
		const severitySection = report.sections[5];
		expect(severitySection.rows).toEqual([
			{ label: 'analytics.issueSeverity.LOW', value: '1' },
			{ label: 'analytics.issueSeverity.MEDIUM', value: '2' },
			{ label: 'analytics.issueSeverity.HIGH', value: '1' },
			{ label: 'analytics.issueSeverity.CRITICAL', value: '1' },
		]);
	});
});
