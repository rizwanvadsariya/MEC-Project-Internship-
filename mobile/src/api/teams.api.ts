import { apiRequest } from './client';

export type EligibleMember = {
	id: string;
	fullName: string;
	email: string;
	role: string;
	departmentId?: number | null;
};

export type TeamMember = EligibleMember & { userId: string; teamRole: string };
export type Team = { id: string; schemeId: number; status: string; version: number; members: TeamMember[] };

export function listEligibleMembers(token: string) {
	return apiRequest<EligibleMember[]>('/teams/eligible-members', { token });
}

export function createTeam(input: { schemeId: number; leadMeoId: string; supportingMemberIds: string[] }, token: string) {
	return apiRequest<Team>('/teams', { method: 'POST', body: input, token });
}

export function submitTeam(teamId: string, token: string) {
	return apiRequest<Team>(`/teams/${teamId}/submit`, { method: 'POST', token });
}

export function resubmitTeam(teamId: string, token: string) {
	return apiRequest<Team>(`/teams/${teamId}/resubmit`, { method: 'POST', token });
}
