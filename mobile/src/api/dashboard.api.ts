import { apiRequest, apiRequestWithMeta } from './client';

export type DivisionSummary = { id: number; name: string };

export type StatusBreakdown<TStatus extends string> = {
	total: number;
	byStatus: Record<TStatus, number>;
};

export type TeamStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type VisitStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type IssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IssueBreakdown = {
	total: number;
	open: number;
	byStatus: Record<IssueStatus, number>;
	bySeverity: Record<IssueSeverity, number>;
};

export type RecentVisit = {
	id: string;
	status: VisitStatus;
	scheduledDate: string | null;
	createdAt: string;
	schemeUid: string;
	schemeName: string;
};

export type RecentIssue = {
	id: string;
	siteVisitId: string;
	issueType: string;
	severity: IssueSeverity;
	status: IssueStatus;
	createdAt: string;
	schemeUid: string;
	schemeName: string;
};

export type DepartmentProgress = {
	departmentId: number;
	departmentName: string;
	schemesTotal: number;
	schemesReported: number;
	avgProgressPct: number | null;
};

export type OverallProgress = {
	avgProgressPct: number | null;
	schemesReported: number;
	schemesTotal: number;
};

export type DivisionDashboard = {
	division: DivisionSummary;
	teams: StatusBreakdown<TeamStatus>;
	visits: StatusBreakdown<VisitStatus>;
	issues: IssueBreakdown;
	progressByDepartment: DepartmentProgress[];
	overallProgress: OverallProgress;
	recentVisits: RecentVisit[];
	recentIssues: RecentIssue[];
};

export type MemberDashboard = {
	visits: StatusBreakdown<VisitStatus>;
	formsDue: number;
	issues: { reportedByMe: number; open: number };
	schemesMonitored: number;
	recentVisits: RecentVisit[];
	recentIssues: RecentIssue[];
};

export function getDivisionDashboard(token: string) {
	return apiRequest<DivisionDashboard>('/dashboards/division', { token });
}

export function getMemberDashboard(token: string) {
	return apiRequest<MemberDashboard>('/dashboards/member', { token });
}

/** Step 27 — physical (MEO-reported) vs. financial (ADP-booklet) progress reconciliation, RD/DG only. */
export type ReconciliationRow = {
	id: number;
	uid: string;
	name: string;
	departmentName: string;
	physicalProgressPct: number;
	financialProgressPct: number;
	gap: number;
};

export type ReconciliationFilters = { flaggedOnly?: boolean; cursor?: string };

export async function getProgressReconciliation(token: string, filters: ReconciliationFilters = {}) {
	const params = new URLSearchParams();
	if (filters.flaggedOnly) params.set('flaggedOnly', 'true');
	if (filters.cursor) params.set('cursor', filters.cursor);
	const qs = params.toString();
	const { data, meta } = await apiRequestWithMeta<{
		schemesTotal: number;
		schemesWithBothValues: number;
		schemesFlagged: number;
		flagThresholdPct: number;
		rows: ReconciliationRow[];
	}>(`/dashboards/reconciliation${qs ? `?${qs}` : ''}`, { token });
	return { ...data, nextCursor: (meta?.nextCursor as string | null) ?? null };
}
