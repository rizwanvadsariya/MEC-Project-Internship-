import { apiRequest } from './client';

/** Step 30 — GIS map view. Division/district progress rollups are
 *  province-wide (open to any authenticated role, same as the scheme
 *  browser, Step 7); `issuesByDistrict` is RD/DG-only and scoped to their
 *  own division server-side — an empty array for every other role, never a
 *  separate 403, so the base (progress-colored) map still works for them. */
export type MapDivisionSummary = {
	divisionId: number;
	divisionName: string;
	schemesTotal: number;
	schemesReported: number;
	avgPhysicalProgressPct: number | null;
};

export type MapDistrictSummary = {
	districtId: number;
	districtName: string;
	divisionId: number;
	schemesTotal: number;
	schemesReported: number;
	avgPhysicalProgressPct: number | null;
};

export type MapDistrictIssues = {
	districtId: number;
	districtName: string;
	openIssues: number;
	critical: number;
	high: number;
	medium: number;
	low: number;
};

export type MapSummary = {
	divisions: MapDivisionSummary[];
	districts: MapDistrictSummary[];
	issuesByDistrict: MapDistrictIssues[];
};

export function getMapSummary(token: string) {
	return apiRequest<MapSummary>('/schemes/map', { token });
}
