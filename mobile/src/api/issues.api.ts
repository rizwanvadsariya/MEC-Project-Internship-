/** fileIssue/deleteIssue (VisitFormScreen — filed on draft-save or submit, removable before submit), listIssues (VisitReportScreen). */
import { apiRequest } from './client';

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';

export type IssueReport = {
	id: string;
	siteVisitId: string;
	reportedBy: string;
	issueType: string;
	severity: IssueSeverity;
	description: string;
	status: IssueStatus;
	resolvedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type IssueReportPayload = {
	issueType: string;
	severity: IssueSeverity;
	description: string;
};

export function listIssues(visitId: string, token: string) {
	return apiRequest<IssueReport[]>(`/site-visits/${visitId}/issues`, { token });
}

export function fileIssue(visitId: string, payload: IssueReportPayload, token: string) {
	return apiRequest<IssueReport>(`/site-visits/${visitId}/issues`, { method: 'POST', body: payload, token });
}

export function deleteIssue(visitId: string, issueId: string, token: string) {
	return apiRequest<void>(`/site-visits/${visitId}/issues/${issueId}`, { method: 'DELETE', token });
}
