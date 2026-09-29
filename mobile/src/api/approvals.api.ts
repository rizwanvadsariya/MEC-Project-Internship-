import { apiRequest, apiRequestWithMeta } from './client';

export type ApprovalMember = { userId: string; teamRole: string; fullName: string; email: string };
export type PendingApproval = {
	requestId: string;
	teamId: string;
	teamVersion: number;
	submittedAt: string;
	schemeId: number;
	schemeUid: string;
	schemeName: string;
	submittedByName: string;
	members: ApprovalMember[];
};

export function listPendingApprovals(token: string) {
	return apiRequest<PendingApproval[]>('/approvals', { token });
}

/** Step 26 — one row per submit/reject/resubmit/approve request, RD/DG both. */
export type ApprovalHistoryEntry = {
	requestId: string;
	teamId: string;
	teamVersion: number;
	decision: 'PENDING' | 'APPROVED' | 'REJECTED';
	remarks: string | null;
	submittedAt: string;
	reviewedAt: string | null;
	teamStatus: string;
	schemeId: number;
	schemeUid: string;
	schemeName: string;
	submittedByName: string;
	reviewedByName: string | null;
};

export type ApprovalHistoryFilters = { teamId?: string; decision?: 'PENDING' | 'APPROVED' | 'REJECTED'; cursor?: string };

export async function listApprovalHistory(token: string, filters: ApprovalHistoryFilters = {}) {
	const params = new URLSearchParams();
	if (filters.teamId) params.set('teamId', filters.teamId);
	if (filters.decision) params.set('decision', filters.decision);
	if (filters.cursor) params.set('cursor', filters.cursor);
	const qs = params.toString();
	const { data, meta } = await apiRequestWithMeta<ApprovalHistoryEntry[]>(`/approvals/history${qs ? `?${qs}` : ''}`, { token });
	return { items: data, nextCursor: (meta?.nextCursor as string | null) ?? null };
}

export function decideApproval(teamId: string, decision: 'APPROVED' | 'REJECTED', remarks: string, token: string) {
	return apiRequest<{ teamId: string; decision: string; remarks: string | null }>(`/approvals/${teamId}/decision`, {
		method: 'POST',
		body: { decision, remarks: remarks || undefined },
		token,
	});
}
