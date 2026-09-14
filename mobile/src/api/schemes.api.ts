import { apiRequest, apiRequestWithMeta } from './client';

export type Scheme = {
	id: number;
	uid: string;
	genSrNo?: string | null;
	name: string;
	status?: string | null;
	departmentId: number;
	departmentName: string;
	subSectorId?: number | null;
	subSectorName?: string | null;
	targetCompletionDate?: string | null;
	estimatedCost?: string | number | null;
	physicalProgressPct?: string | number | null;
	financialProgressPct?: string | number | null;
	districts: string[];
	divisions: string[];
};

export type Lookup = { id: number; name: string };
export type DistrictLookup = Lookup & { divisionId: number };
export type SchemeFilters = {
	search?: string;
	divisionId?: number;
	districtId?: number;
	departmentId?: number;
	subSectorId?: number;
	status?: string;
	cursor?: string;
	limit?: number;
};

export type SchemeFilterOptions = {
	divisions: Lookup[];
	districts: DistrictLookup[];
	departments: Lookup[];
	subSectors: (Lookup & { departmentId: number })[];
	statuses: string[];
};

function queryString(filters: SchemeFilters) {
	const params = new URLSearchParams();
	Object.entries(filters).forEach(([key, value]) => {
		if (value !== undefined && value !== '') params.set(key, String(value));
	});
	const query = params.toString();
	return query ? `?${query}` : '';
}

export async function listSchemes(filters: SchemeFilters, token: string) {
	const response = await apiRequestWithMeta<Scheme[]>(`/schemes${queryString(filters)}`, { token });
	const nextCursor = typeof response.meta?.nextCursor === 'string' ? response.meta.nextCursor : null;
	return { schemes: response.data, nextCursor };
}

export function getSchemeFilterOptions(token: string) {
	return apiRequest<SchemeFilterOptions>('/schemes/filters', { token });
}

export function getScheme(id: number, token: string) {
	return apiRequest<Scheme>(`/schemes/${id}`, { token });
}
