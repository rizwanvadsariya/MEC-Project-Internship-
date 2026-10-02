/**
 * Custom KPI dashboards per role (phases.md Step 34 — "same data model,
 * different scope: province vs. division"), depending on Steps 23/30/31/33
 * and explicitly framed as "the final layer — combines every analytics
 * building block built so far." Needs no new backend endpoint at all: every
 * number here comes from an endpoint this app already has —
 * `GET /schemes/map` (Step 30, province-wide, open to every role — the
 * "province" scope layer), `GET /dashboards/division` (Step 23, RD/DG's own
 * division — the "division" scope layer), `GET /dashboards/member` (Step
 * 16, MEO/Support's own team-membership scope — the closest thing those two
 * roles have to a "division" view, since neither has division-wide access
 * anywhere else in the app either), and `GET /dashboards/anomalies` (Steps
 * 31/33, RD/DG's own division). "Same data model" is literal: the province
 * card list and the division card list both ultimately read the same
 * `schemes.physical_progress_pct` rollup, just aggregated at a different
 * level — exactly the step's own framing, not a loose interpretation of it.
 *
 * Kept as pure functions (API response shapes in, `KpiCard[]` out) so the
 * part of this step that can actually go wrong — which numbers go in which
 * card, with what tone, in what order — is fully unit-testable without a
 * screen, a network call, or a device, matching this project's established
 * "test the pure logic, accept on-device rendering as an honest real-device
 * caveat" precedent.
 */
import type { AnomaliesSummary, DivisionDashboard, MemberDashboard } from '../api/dashboard.api';
import type { MapDivisionSummary } from '../api/map.api';
import type { TFunction } from '../utils/dateTime';

export type KpiTone = 'default' | 'warning' | 'danger';
export type KpiCard = { key: string; label: string; value: string; tone: KpiTone };

function formatPct(value: number | null, t: TFunction): string {
	if (value === null) return t('kpi.notYetReported');
	return `${Math.round(value)}%`;
}

/** The "province" scope layer — one card per division, open to every role
 *  (the exact same data Step 30's map colors its progress mode by).
 *  Alphabetical, not divisionId order, so the list reads predictably to a
 *  human regardless of how the divisions happen to be seeded/numbered. */
export function buildProvinceOverviewCards(divisions: MapDivisionSummary[], t: TFunction): KpiCard[] {
	return [...divisions]
		.sort((a, b) => a.divisionName.localeCompare(b.divisionName))
		.map((division) => ({
			key: `division-${division.divisionId}`,
			label: division.divisionName,
			value: formatPct(division.avgPhysicalProgressPct, t),
			tone: 'default',
		}));
}

/** The "division" scope layer for RD/DG — combines Step 23's own division
 *  dashboard with Step 31/33's anomaly/risk totals into one flat card list.
 *  A non-zero flagged count gets `tone: 'danger'` — these are the numbers
 *  that should actually draw an RD/DG's eye on a KPI summary, not just
 *  restate the detail screens. */
export function buildDivisionKpiCards(summary: DivisionDashboard, anomalies: AnomaliesSummary, t: TFunction): KpiCard[] {
	return [
		{ key: 'overallProgress', label: t('kpi.overallProgress'), value: formatPct(summary.overallProgress.avgProgressPct, t), tone: 'default' },
		{ key: 'activeTeams', label: t('kpi.activeTeams'), value: String(summary.teams.total), tone: 'default' },
		{ key: 'activeVisits', label: t('kpi.activeVisits'), value: String(summary.visits.total), tone: 'default' },
		{ key: 'openIssues', label: t('kpi.openIssues'), value: String(summary.issues.open), tone: summary.issues.open > 0 ? 'warning' : 'default' },
		{ key: 'noRecentVisit', label: t('kpi.noRecentVisit'), value: String(anomalies.noRecentVisit.total), tone: anomalies.noRecentVisit.total > 0 ? 'danger' : 'default' },
		{ key: 'spendWithoutProgress', label: t('kpi.spendWithoutProgress'), value: String(anomalies.spendWithoutProgress.total), tone: anomalies.spendWithoutProgress.total > 0 ? 'danger' : 'default' },
		{ key: 'atRisk', label: t('kpi.atRisk'), value: String(anomalies.atRiskOfMissingTarget.total), tone: anomalies.atRiskOfMissingTarget.total > 0 ? 'danger' : 'default' },
	];
}

/** The scoped layer for MEO/Support — Step 16's own member dashboard,
 *  the closest analogue to "my division" these two roles have (both are
 *  team-membership-scoped everywhere else in the app, never division-wide). */
export function buildMemberKpiCards(summary: MemberDashboard, t: TFunction): KpiCard[] {
	return [
		{ key: 'schemesMonitored', label: t('kpi.schemesMonitored'), value: String(summary.schemesMonitored), tone: 'default' },
		{ key: 'activeVisits', label: t('kpi.activeVisits'), value: String(summary.visits.total), tone: 'default' },
		{ key: 'formsDue', label: t('kpi.formsDue'), value: String(summary.formsDue), tone: summary.formsDue > 0 ? 'warning' : 'default' },
		{ key: 'openIssues', label: t('kpi.openIssues'), value: String(summary.issues.open), tone: summary.issues.open > 0 ? 'warning' : 'default' },
	];
}
