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

/** Step 31 — delay/anomaly detection, RD/DG only, division-scoped. Two
 *  independent "flagged problem" lists, each with a `total` (the real
 *  backlog size) alongside a capped `rows` list (default 50, up to 200 via
 *  `limit`) — not cursor-paginated, deliberately, since these are short
 *  oversight lists, not a full browse view. */
export type NoRecentVisitRow = {
	id: number;
	uid: string;
	name: string;
	departmentName: string;
	lastVisitDate: string | null;
};

export type SpendWithoutProgressRow = {
	id: number;
	uid: string;
	name: string;
	departmentName: string;
	physicalProgressPct: number;
	financialProgressPct: number;
};

/** Step 33 — predictive risk flagging, "builds directly on the
 *  anomaly-detection foundation" — a third category on this same response.
 *  `targetDate` is the last day of the scheme's "Mon-YY" target month;
 *  `expectedProgressPct` is the linear-pace projection from
 *  `date_of_approval` to that date, clamped to [0,100]. A scheme already
 *  past `targetDate` and still incomplete is flagged regardless of
 *  `expectedProgressPct - physicalProgressPct` (`isOverdue: true`). */
export type AtRiskRow = {
	id: number;
	uid: string;
	name: string;
	departmentName: string;
	targetDate: string;
	expectedProgressPct: number;
	physicalProgressPct: number;
	isOverdue: boolean;
};

export type AnomaliesSummary = {
	noVisitThresholdMonths: number;
	spendWithoutProgressThresholds: { financialMinPct: number; physicalMaxPct: number };
	riskGapThresholdPct: number;
	noRecentVisit: { total: number; rows: NoRecentVisitRow[] };
	spendWithoutProgress: { total: number; rows: SpendWithoutProgressRow[] };
	atRiskOfMissingTarget: { total: number; rows: AtRiskRow[] };
};

export function getAnomalies(token: string, limit?: number) {
	const qs = limit ? `?limit=${limit}` : '';
	return apiRequest<AnomaliesSummary>(`/dashboards/anomalies${qs}`, { token });
}
