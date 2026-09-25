'use strict';

jest.mock('../../../src/repositories/issue.repo', () => ({
	findVisitContext: jest.fn(),
	create: jest.fn(),
	list: jest.fn(),
	findById: jest.fn(),
	remove: jest.fn(),
}));

const issueRepo = require('../../../src/repositories/issue.repo');
const issueService = require('../../../src/services/issue.service');

const actor = { id: 'meo-1', role: 'MEO', divisionId: 1 };
const payload = { issueType: 'Construction defect', severity: 'HIGH', description: 'Crack in the boundary wall.' };

beforeEach(() => {
	jest.clearAllMocks();
	issueRepo.findVisitContext.mockResolvedValue({ isLeadMeo: true, formSubmitted: false });
	issueRepo.create.mockResolvedValue({ id: 'issue-1', ...payload, status: 'OPEN' });
	issueRepo.list.mockResolvedValue([{ id: 'issue-1', ...payload, status: 'OPEN' }]);
	issueRepo.findById.mockResolvedValue({ id: 'issue-1', siteVisitId: 'visit-1' });
});

test('lead MEO files an issue report', async () => {
	await expect(issueService.file(actor, 'visit-1', payload)).resolves.toEqual({ id: 'issue-1', ...payload, status: 'OPEN' });
	expect(issueRepo.create).toHaveBeenCalledWith('visit-1', actor.id, payload);
});

test('rejects filing from a non-lead team member', async () => {
	issueRepo.findVisitContext.mockResolvedValue({ isLeadMeo: false, formSubmitted: false });
	await expect(issueService.file({ ...actor, role: 'SUPPORT_USER' }, 'visit-1', payload)).rejects.toMatchObject({ statusCode: 403 });
	expect(issueRepo.create).not.toHaveBeenCalled();
});

test('404s when the actor cannot see the site visit at all', async () => {
	issueRepo.findVisitContext.mockResolvedValue(null);
	await expect(issueService.file(actor, 'visit-1', payload)).rejects.toMatchObject({ statusCode: 404 });
	await expect(issueService.list(actor, 'visit-1')).rejects.toMatchObject({ statusCode: 404 });
});

test('locks issue filing once the visit report has been submitted', async () => {
	issueRepo.findVisitContext.mockResolvedValue({ isLeadMeo: true, formSubmitted: true });
	await expect(issueService.file(actor, 'visit-1', payload)).rejects.toMatchObject({ statusCode: 409, code: 'VISIT_REPORT_LOCKED' });
});

test('a non-lead viewer sees issues once the report is submitted, not before', async () => {
	issueRepo.findVisitContext.mockResolvedValueOnce({ isLeadMeo: false, formSubmitted: false });
	await expect(issueService.list({ ...actor, role: 'SUPPORT_USER' }, 'visit-1')).resolves.toEqual([]);
	expect(issueRepo.list).not.toHaveBeenCalled();

	issueRepo.findVisitContext.mockResolvedValueOnce({ isLeadMeo: false, formSubmitted: true });
	await expect(issueService.list({ ...actor, role: 'SUPPORT_USER' }, 'visit-1')).resolves.toEqual([{ id: 'issue-1', ...payload, status: 'OPEN' }]);
});

test('the lead MEO can always list their own issues, submitted or not', async () => {
	issueRepo.findVisitContext.mockResolvedValue({ isLeadMeo: true, formSubmitted: false });
	await expect(issueService.list(actor, 'visit-1')).resolves.toEqual([{ id: 'issue-1', ...payload, status: 'OPEN' }]);
});

test('lead MEO removes an issue report before the report is locked', async () => {
	await issueService.remove(actor, 'visit-1', 'issue-1');
	expect(issueRepo.remove).toHaveBeenCalledWith('issue-1');
});

test('remove rejects a non-lead actor and a locked report', async () => {
	issueRepo.findVisitContext.mockResolvedValueOnce({ isLeadMeo: false, formSubmitted: false });
	await expect(issueService.remove(actor, 'visit-1', 'issue-1')).rejects.toMatchObject({ statusCode: 403 });

	issueRepo.findVisitContext.mockResolvedValueOnce({ isLeadMeo: true, formSubmitted: true });
	await expect(issueService.remove(actor, 'visit-1', 'issue-1')).rejects.toMatchObject({ statusCode: 409, code: 'VISIT_REPORT_LOCKED' });
});

test('remove 404s when the issue does not belong to the visit', async () => {
	issueRepo.findById.mockResolvedValue(null);
	await expect(issueService.remove(actor, 'visit-1', 'issue-1')).rejects.toMatchObject({ statusCode: 404 });
});
