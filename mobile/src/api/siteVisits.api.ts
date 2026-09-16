import { apiRequest, apiRequestWithMeta } from './client';

export type SiteVisitStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type SiteVisitSummary = {
	id: string;
	teamId: string;
	schemeId: number;
	status: SiteVisitStatus;
	scheduledDate: string | null;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
	schemeUid: string;
	schemeName: string;
};

export type SiteVisitMember = { id: string; userId: string; teamRole: string; fullName: string; email: string };
export type SiteVisitDetail = SiteVisitSummary & { members: SiteVisitMember[] };

export async function listSiteVisits(token: string, cursor?: string | null) {
	const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
	const { data, meta } = await apiRequestWithMeta<SiteVisitSummary[]>(`/site-visits${query}`, { token });
	return { items: data, nextCursor: (meta?.nextCursor as string | null) ?? null };
}

export function getSiteVisit(id: string, token: string) {
	return apiRequest<SiteVisitDetail>(`/site-visits/${id}`, { token });
}
