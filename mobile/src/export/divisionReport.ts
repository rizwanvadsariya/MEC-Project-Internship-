/**
 * PDF/Excel export for offline reporting (phases.md Step 29, depends on
 * Step 16's division dashboard + Step 23's analytics — "exports the
 * dashboard/analytics views, so those need to exist and be trustworthy
 * first"). This module is the pure data-shaping half: it turns the already
 * server-computed, already-trustworthy `DivisionDashboard` payload
 * (AnalyticsScreen's own data source) into a flat, format-agnostic
 * `DivisionReport` structure that `reportFormats.ts` then renders as HTML
 * (for PDF) or a workbook (for Excel).
 *
 * Deliberately mirrors AnalyticsScreen.tsx's own section layout and reuses
 * its exact translation keys (`analytics.teamStatus.*`, `siteVisits.status.*`,
 * `analytics.issueStatus.*`, `analytics.issueSeverity.*`) rather than a
 * parallel set, so the exported report can never drift from what the screen
 * itself shows — the same "one convention, not two competing ones" principle
 * dateTime.ts documents for its own date formatting.
 */
import type { TFunction } from '../utils/dateTime';
import { formatExactDateTime } from '../utils/dateTime';
import type {
	DivisionDashboard,
	TeamStatus,
	VisitStatus,
	IssueStatus,
	IssueSeverity,
} from '../api/dashboard.api';

const TEAM_STATUSES: TeamStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
const VISIT_STATUSES: VisitStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ISSUE_STATUSES: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];
const ISSUE_SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export type ReportRow = { label: string; value: string };
export type ReportSection = { heading: string; rows: ReportRow[] };

export type DivisionReport = {
	title: string;
	divisionName: string;
	generatedAtIso: string;
	generatedAtLabel: string;
	sections: ReportSection[];
};

function formatPct(value: number | null, t: TFunction): string {
	if (value === null) return t('analytics.notYetReported');
	return `${Math.round(value)}%`;
}

export function buildDivisionReport(
	dashboard: DivisionDashboard,
	t: TFunction,
	now: number = Date.now(),
): DivisionReport {
	const generatedAtIso = new Date(now).toISOString();

	const overallSection: ReportSection = {
		heading: t('analytics.overallProgress'),
		rows: [
			{ label: t('analytics.overallProgress'), value: formatPct(dashboard.overallProgress.avgProgressPct, t) },
			{
				label: t('analytics.export.schemesReportedLabel'),
				value: t('analytics.schemesReportedContext', {
					reported: dashboard.overallProgress.schemesReported,
					total: dashboard.overallProgress.schemesTotal,
				}),
			},
		],
	};

	const departmentSection: ReportSection = {
		heading: t('analytics.progressByDepartment'),
		rows:
			dashboard.progressByDepartment.length === 0
				? [{ label: t('analytics.noDepartments'), value: '' }]
				: dashboard.progressByDepartment.map((dept) => ({
					label: dept.departmentName,
					value: `${formatPct(dept.avgProgressPct, t)} (${t('analytics.schemesReportedContext', {
						reported: dept.schemesReported,
						total: dept.schemesTotal,
					})})`,
				})),
	};

	const teamsSection: ReportSection = {
		heading: `${t('analytics.statusBreakdown')} — ${t('analytics.teams')}`,
		rows: TEAM_STATUSES.map((status) => ({
			label: t(`analytics.teamStatus.${status}`),
			value: String(dashboard.teams.byStatus[status]),
		})),
	};

	const visitsSection: ReportSection = {
		heading: `${t('analytics.statusBreakdown')} — ${t('analytics.visits')}`,
		rows: VISIT_STATUSES.map((status) => ({
			label: t(`siteVisits.status.${status}`),
			value: String(dashboard.visits.byStatus[status]),
		})),
	};

	const issuesSection: ReportSection = {
		heading: `${t('analytics.statusBreakdown')} — ${t('analytics.issues')}`,
		rows: ISSUE_STATUSES.map((status) => ({
			label: t(`analytics.issueStatus.${status}`),
			value: String(dashboard.issues.byStatus[status]),
		})),
	};

	const severitySection: ReportSection = {
		heading: t('analytics.issuesBySeverity'),
		rows: ISSUE_SEVERITIES.map((severity) => ({
			label: t(`analytics.issueSeverity.${severity}`),
			value: String(dashboard.issues.bySeverity[severity]),
		})),
	};

	return {
		title: t('analytics.export.reportTitle', { division: dashboard.division.name }),
		divisionName: dashboard.division.name,
		generatedAtIso,
		generatedAtLabel: formatExactDateTime(generatedAtIso),
		sections: [overallSection, departmentSection, teamsSection, visitsSection, issuesSection, severitySection],
	};
}
