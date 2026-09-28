'use strict';

jest.mock('../../../src/repositories/issue.repo', () => ({
	findVisitContext: jest.fn(),
	isRdForSiteVisit: jest.fn(),
	create: jest.fn(),
	list: jest.fn(),
	findById: jest.fn(),
	remove: jest.fn(),
	updateLifecycle: jest.fn(),
}));
jest.mock('../../../src/repositories/user.repo', () => ({ findById: jest.fn() }));
jest.mock('../../../src/services/notification.service', () => ({ notifyIssueOwnerAssigned: jest.fn(), notifyCriticalIssueFiled: jest.fn() }));

const issueRepo = require('../../../src/repositories/issue.repo');
const userRepo = require('../../../src/repositories/user.repo');
const notificationService = require('../../../src/services/notification.service');
const issueService = require('../../../src/services/issue.service');

const actor = { id: 'meo-1', role: 'MEO', divisionId: 1 };
const rd = { id: 'rd-1', role: 'REGIONAL_DIRECTOR', divisionId: 1 };
const payload = { issueType: 'Construction defect', severity: 'HIGH', description: 'Crack in the boundary wall.' };

beforeEach(() => {
	jest.clearAllMocks();
	issueRepo.findVisitContext.mockResolvedValue({ isLeadMeo: true, formSubmitted: false });
	issueRepo.isRdForSiteVisit.mockResolvedValue(true);
	issueRepo.create.mockResolvedValue({ id: 'issue-1', ...payload, status: 'OPEN' });
	issueRepo.list.mockResolvedValue([{ id: 'issue-1', ...payload, status: 'OPEN' }]);
	issueRepo.findById.mockResolvedValue({ id: 'issue-1', siteVisitId: 'visit-1', status: 'OPEN', ownerId: null });
	issueRepo.updateLifecycle.mockResolvedValue({ id: 'issue-1', siteVisitId: 'visit-1', status: 'ACKNOWLEDGED', ownerId: null });
});

test('lead MEO files an issue report', async () => {
	await expect(issueService.file(actor, 'visit-1', payload)).resolves.toEqual({ id: 'issue-1', ...payload, status: 'OPEN' });
	expect(issueRepo.create).toHaveBeenCalledWith('visit-1', actor.id, payload);
});

describe('CRITICAL escalation trigger (Step 25)', () => {
	test('a CRITICAL issue fires the immediate escalation notification', async () => {
		const critical = { ...payload, severity: 'CRITICAL' };
		issueRepo.create.mockResolvedValue({ id: 'issue-1', ...critical, status: 'OPEN', siteVisitId: 'visit-1' });

		await issueService.file(actor, 'visit-1', critical);

		expect(notificationService.notifyCriticalIssueFiled).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'issue-1', severity: 'CRITICAL' }),
		);
	});

	test('a non-CRITICAL issue never fires the escalation notification', async () => {
		await issueService.file(actor, 'visit-1', { ...payload, severity: 'HIGH' });
		expect(notificationService.notifyCriticalIssueFiled).not.toHaveBeenCalled();
	});

	test('escalation fires even though the report is still an unsubmitted draft', async () => {
		issueRepo.findVisitContext.mockResolvedValue({ isLeadMeo: true, formSubmitted: false });
		const critical = { ...payload, severity: 'CRITICAL' };
		issueRepo.create.mockResolvedValue({ id: 'issue-1', ...critical, status: 'OPEN', siteVisitId: 'visit-1' });

		await issueService.file(actor, 'visit-1', critical);

		expect(notificationService.notifyCriticalIssueFiled).toHaveBeenCalled();
	});

	test('a rejected filing (locked report) never reaches the escalation trigger', async () => {
		issueRepo.findVisitContext.mockResolvedValue({ isLeadMeo: true, formSubmitted: true });
		await expect(issueService.file(actor, 'visit-1', { ...payload, severity: 'CRITICAL' })).rejects.toMatchObject({ statusCode: 409 });
		expect(notificationService.notifyCriticalIssueFiled).not.toHaveBeenCalled();
	});
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

describe('updateLifecycle (Step 24)', () => {
	test('the division RD advances status forward', async () => {
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { status: 'ACKNOWLEDGED' })).resolves.toEqual({
			id: 'issue-1', siteVisitId: 'visit-1', status: 'ACKNOWLEDGED', ownerId: null,
		});
		expect(issueRepo.updateLifecycle).toHaveBeenCalledWith('issue-1', { status: 'ACKNOWLEDGED' }, { acknowledgedAt: expect.any(Date) });
	});

	test('allows skipping straight to a later status, not just the next one', async () => {
		await issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { status: 'RESOLVED' });
		expect(issueRepo.updateLifecycle).toHaveBeenCalledWith('issue-1', { status: 'RESOLVED' }, { resolvedAt: expect.any(Date) });
	});

	test('rejects a sideways or backward transition', async () => {
		issueRepo.findById.mockResolvedValue({ id: 'issue-1', siteVisitId: 'visit-1', status: 'IN_PROGRESS', ownerId: null });
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { status: 'ACKNOWLEDGED' }))
			.rejects.toMatchObject({ statusCode: 409, code: 'ISSUE_INVALID_TRANSITION' });
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { status: 'IN_PROGRESS' }))
			.rejects.toMatchObject({ statusCode: 409, code: 'ISSUE_INVALID_TRANSITION' });
		expect(issueRepo.updateLifecycle).not.toHaveBeenCalled();
	});

	test('a resolved issue is locked against any further lifecycle change', async () => {
		issueRepo.findById.mockResolvedValue({ id: 'issue-1', siteVisitId: 'visit-1', status: 'RESOLVED', ownerId: 'meo-2' });
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { ownerId: 'meo-3' }))
			.rejects.toMatchObject({ statusCode: 409, code: 'ISSUE_RESOLVED_LOCKED' });
		expect(issueRepo.updateLifecycle).not.toHaveBeenCalled();
	});

	test('rejects a non-RD actor, including the DG', async () => {
		issueRepo.isRdForSiteVisit.mockResolvedValue(false);
		await expect(issueService.updateLifecycle({ ...rd, role: 'DIRECTOR_GENERAL' }, 'visit-1', 'issue-1', { status: 'ACKNOWLEDGED' }))
			.rejects.toMatchObject({ statusCode: 403 });
		await expect(issueService.updateLifecycle(actor, 'visit-1', 'issue-1', { status: 'ACKNOWLEDGED' }))
			.rejects.toMatchObject({ statusCode: 403 });
		expect(issueRepo.updateLifecycle).not.toHaveBeenCalled();
	});

	test('404s when the RD cannot see the site visit at all', async () => {
		issueRepo.findVisitContext.mockResolvedValue(null);
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { status: 'ACKNOWLEDGED' })).rejects.toMatchObject({ statusCode: 404 });
	});

	test('404s when the issue does not belong to the visit', async () => {
		issueRepo.findById.mockResolvedValue(null);
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { status: 'ACKNOWLEDGED' })).rejects.toMatchObject({ statusCode: 404 });
	});

	test('assigns an eligible in-division MEO as owner and notifies them', async () => {
		userRepo.findById.mockResolvedValue({ id: 'meo-2', role: 'MEO', division_id: 1, is_active: true });
		await issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { ownerId: 'meo-2' });
		expect(issueRepo.updateLifecycle).toHaveBeenCalledWith('issue-1', { ownerId: 'meo-2' }, {});
		expect(notificationService.notifyIssueOwnerAssigned).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'issue-1' }),
		);
	});

	test('accepts a division-agnostic support user (null division_id) as owner', async () => {
		userRepo.findById.mockResolvedValue({ id: 'support-1', role: 'SUPPORT_USER', division_id: null, is_active: true });
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { ownerId: 'support-1' })).resolves.toBeDefined();
	});

	test('rejects an out-of-division, inactive, or wrong-role owner', async () => {
		userRepo.findById.mockResolvedValue({ id: 'meo-2', role: 'MEO', division_id: 2, is_active: true });
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { ownerId: 'meo-2' }))
			.rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ISSUE_OWNER' });

		userRepo.findById.mockResolvedValue({ id: 'meo-2', role: 'MEO', division_id: 1, is_active: false });
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { ownerId: 'meo-2' }))
			.rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ISSUE_OWNER' });

		userRepo.findById.mockResolvedValue({ id: 'dg-1', role: 'DIRECTOR_GENERAL', division_id: 1, is_active: true });
		await expect(issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { ownerId: 'dg-1' }))
			.rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ISSUE_OWNER' });

		expect(issueRepo.updateLifecycle).not.toHaveBeenCalled();
	});

	test('unassigning (ownerId: null) never triggers the eligibility lookup or a notification', async () => {
		await issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { ownerId: null });
		expect(userRepo.findById).not.toHaveBeenCalled();
		expect(notificationService.notifyIssueOwnerAssigned).not.toHaveBeenCalled();
		expect(issueRepo.updateLifecycle).toHaveBeenCalledWith('issue-1', { ownerId: null }, {});
	});

	test('reassigning to the same current owner does not re-notify', async () => {
		issueRepo.findById.mockResolvedValue({ id: 'issue-1', siteVisitId: 'visit-1', status: 'OPEN', ownerId: 'meo-2' });
		userRepo.findById.mockResolvedValue({ id: 'meo-2', role: 'MEO', division_id: 1, is_active: true });
		await issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { ownerId: 'meo-2' });
		expect(notificationService.notifyIssueOwnerAssigned).not.toHaveBeenCalled();
	});

	test('setting a due date alongside a status change applies both in one call', async () => {
		await issueService.updateLifecycle(rd, 'visit-1', 'issue-1', { status: 'ACKNOWLEDGED', dueDate: '2026-12-01' });
		expect(issueRepo.updateLifecycle).toHaveBeenCalledWith(
			'issue-1',
			{ status: 'ACKNOWLEDGED', dueDate: '2026-12-01' },
			{ acknowledgedAt: expect.any(Date) },
		);
	});
});
