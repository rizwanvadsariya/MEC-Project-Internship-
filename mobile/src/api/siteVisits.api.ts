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
	/** Only present on list results (phases.md Step 21's calendar) — whether the calling actor is this visit's own lead MEO. */
	isLeadMeo?: boolean;
};

export type SiteVisitMember = { id: string; userId: string; teamRole: string; fullName: string; email: string };
export type SiteVisitDetail = SiteVisitSummary & { members: SiteVisitMember[] };

export type SiteVisitListFilters = {
	cursor?: string | null;
	schemeId?: number;
	status?: SiteVisitStatus;
	/** Calendar filters (phases.md Step 21) — bound scheduled_date (inclusive), or find visits still needing a date. */
	scheduledFrom?: string;
	scheduledTo?: string;
	unscheduled?: boolean;
};

export async function listSiteVisits(token: string, filters: SiteVisitListFilters = {}) {
	const params = new URLSearchParams();
	if (filters.cursor) params.set('cursor', filters.cursor);
	if (filters.schemeId) params.set('schemeId', String(filters.schemeId));
	if (filters.status) params.set('status', filters.status);
	if (filters.scheduledFrom) params.set('scheduledFrom', filters.scheduledFrom);
	if (filters.scheduledTo) params.set('scheduledTo', filters.scheduledTo);
	if (filters.unscheduled) params.set('unscheduled', 'true');
	const query = params.toString() ? `?${params.toString()}` : '';
	const { data, meta } = await apiRequestWithMeta<SiteVisitSummary[]>(`/site-visits${query}`, { token });
	return { items: data, nextCursor: (meta?.nextCursor as string | null) ?? null };
}

export function getSiteVisit(id: string, token: string) {
	return apiRequest<SiteVisitDetail>(`/site-visits/${id}`, { token });
}

export function scheduleSiteVisit(id: string, scheduledDate: string | null, token: string) {
	return apiRequest<SiteVisitSummary>(`/site-visits/${id}/schedule`, { method: 'PATCH', body: { scheduledDate }, token });
}
