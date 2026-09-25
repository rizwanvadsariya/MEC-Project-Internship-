import { apiRequest } from './client';

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

export type DivisionDashboard = {
	division: DivisionSummary;
	teams: StatusBreakdown<TeamStatus>;
	visits: StatusBreakdown<VisitStatus>;
	issues: IssueBreakdown;
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
