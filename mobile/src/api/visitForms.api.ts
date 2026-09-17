/** getTemplate(visitId), saveDraft, submit. */
import { apiRequest } from './client';

export type FormField = {
	id: string;
	fieldKey: string;
	label: string;
	fieldType: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'date' | 'photo';
	options: string[] | null;
	isRequired: boolean;
	sortOrder: number;
};

export type VisitForm = {
	id: string;
	siteVisitId: string;
	templateId: string;
	filledBy: string;
	status: 'DRAFT' | 'SUBMITTED';
	physicalProgressPct: number | null;
	remarks: string | null;
	responses: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

export type VisitFormPayload = {
	physicalProgressPct: number;
	remarks?: string | null;
	responses: Record<string, unknown>;
};

export type VisitFormContext = {
	siteVisitId: string;
	template: { id: string; departmentId: number; name: string; version: number; fields: FormField[] };
	form: VisitForm | null;
	canEdit: boolean;
};

export function getVisitForm(visitId: string, token: string) {
	return apiRequest<VisitFormContext>(`/site-visits/${visitId}/form`, { token });
}

export function saveVisitForm(visitId: string, payload: VisitFormPayload, token: string) {
	return apiRequest<VisitForm>(`/site-visits/${visitId}/form`, { method: 'PUT', body: payload, token });
}

export function submitVisitForm(visitId: string, payload: VisitFormPayload, token: string) {
	return apiRequest<VisitForm>(`/site-visits/${visitId}/form/submit`, { method: 'POST', body: payload, token });
}
