import { apiRequest } from './client';

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

export function decideApproval(teamId: string, decision: 'APPROVED' | 'REJECTED', remarks: string, token: string) {
	return apiRequest<{ teamId: string; decision: string; remarks: string | null }>(`/approvals/${teamId}/decision`, {
		method: 'POST',
		body: { decision, remarks: remarks || undefined },
		token,
	});
}
