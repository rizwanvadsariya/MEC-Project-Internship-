'use strict';

jest.mock('../../../src/repositories/visitForm.repo', () => ({
	findContext: jest.fn(),
	findTemplate: jest.fn(),
	findForm: jest.fn(),
	save: jest.fn(),
}));
// notification.service transitively requires src/config/database (fatal with
// no backend/.env) — same factory-mock rationale as approval.service.test.js.
jest.mock('../../../src/services/notification.service', () => ({
	notifyVisitCompleted: jest.fn(),
}));

const visitFormRepo = require('../../../src/repositories/visitForm.repo');
const notificationService = require('../../../src/services/notification.service');
const service = require('../../../src/services/visitForm.service');

const actor = { id: 'meo-1', role: 'MEO', divisionId: 1 };
const template = {
	id: 'template-1',
	fields: [
		{ fieldKey: 'facility_functional', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'facility_type', fieldType: 'select', options: ['HOSPITAL', 'OTHER'], isRequired: true },
		{ fieldKey: 'staff_present', fieldType: 'number', isRequired: false },
	],
};

beforeEach(() => {
	jest.clearAllMocks();
	visitFormRepo.findContext.mockResolvedValue({ departmentId: 13, isLeadMeo: true });
	visitFormRepo.findTemplate.mockResolvedValue(template);
	visitFormRepo.findForm.mockResolvedValue(null);
	visitFormRepo.save.mockResolvedValue({ id: 'form-1', status: 'DRAFT' });
});

test('lead MEO can save a draft with partial dynamic responses', async () => {
	const payload = { physicalProgressPct: 42, remarks: 'Foundation work observed', responses: { staff_present: 4 } };

	await expect(service.save(actor, 'visit-1', payload, 'DRAFT')).resolves.toEqual({ id: 'form-1', status: 'DRAFT' });
	expect(visitFormRepo.save).toHaveBeenCalledWith('visit-1', actor.id, template.id, payload, 'DRAFT');
	// A draft save is not "visit completed" — the trigger only fires on SUBMITTED.
	expect(notificationService.notifyVisitCompleted).not.toHaveBeenCalled();
});

test('submitting the form fires the "visit completed" notification trigger (phases.md Step 17)', async () => {
	visitFormRepo.save.mockResolvedValue({ id: 'form-1', status: 'SUBMITTED' });
	const payload = {
		physicalProgressPct: 100,
		responses: { facility_functional: true, facility_type: 'HOSPITAL', staff_present: 4 },
	};

	await service.save(actor, 'visit-1', payload, 'SUBMITTED');

	expect(notificationService.notifyVisitCompleted).toHaveBeenCalledWith('visit-1');
});

test('submission rejects missing required dynamic fields', async () => {
	await expect(service.save(actor, 'visit-1', {
		physicalProgressPct: 42,
		responses: { staff_present: 4 },
	}, 'SUBMITTED')).rejects.toMatchObject({ statusCode: 400, details: { fields: ['facility_functional', 'facility_type'] } });
	});

test('submission rejects invalid dynamic values and unknown fields', async () => {
	await expect(service.save(actor, 'visit-1', {
		physicalProgressPct: 42,
		responses: { facility_functional: 'yes', facility_type: 'CLINIC' },
	}, 'SUBMITTED')).rejects.toMatchObject({ statusCode: 400 });

	await expect(service.save(actor, 'visit-1', {
		physicalProgressPct: 42,
		responses: { facility_functional: true, facility_type: 'HOSPITAL', unknown: true },
	}, 'DRAFT')).rejects.toMatchObject({ statusCode: 400, details: { fields: ['unknown'] } });
});

test('only the lead MEO can edit and a submitted form cannot be changed', async () => {
	visitFormRepo.findContext.mockResolvedValue({ departmentId: 13, isLeadMeo: false });
	await expect(service.save(actor, 'visit-1', { physicalProgressPct: 1, responses: {} }, 'DRAFT')).rejects.toMatchObject({ statusCode: 403 });

	visitFormRepo.findContext.mockResolvedValue({ departmentId: 13, isLeadMeo: true });
	visitFormRepo.findForm.mockResolvedValue({ status: 'SUBMITTED' });
	await expect(service.save(actor, 'visit-1', { physicalProgressPct: 1, responses: {} }, 'DRAFT')).rejects.toMatchObject({ statusCode: 409 });
});

test('the lead MEO can always see their own draft; a non-lead viewer sees null until it is submitted', async () => {
	visitFormRepo.findContext.mockResolvedValue({ departmentId: 13, isLeadMeo: true });
	visitFormRepo.findForm.mockResolvedValue({ id: 'form-1', status: 'DRAFT', physicalProgressPct: 20 });
	await expect(service.get(actor, 'visit-1')).resolves.toMatchObject({ form: { id: 'form-1', status: 'DRAFT', physicalProgressPct: 20 }, canEdit: true });

	visitFormRepo.findContext.mockResolvedValue({ departmentId: 13, isLeadMeo: false });
	await expect(service.get({ ...actor, role: 'SUPPORT_USER' }, 'visit-1')).resolves.toMatchObject({ form: null, canEdit: false });
});

test('a non-lead viewer sees the form once it is SUBMITTED', async () => {
	visitFormRepo.findContext.mockResolvedValue({ departmentId: 13, isLeadMeo: false });
	visitFormRepo.findForm.mockResolvedValue({ id: 'form-1', status: 'SUBMITTED', physicalProgressPct: 100 });
	await expect(service.get({ ...actor, role: 'SUPPORT_USER' }, 'visit-1')).resolves.toMatchObject({ form: { id: 'form-1', status: 'SUBMITTED', physicalProgressPct: 100 }, canEdit: false });
});