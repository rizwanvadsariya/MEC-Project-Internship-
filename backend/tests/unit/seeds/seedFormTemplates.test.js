'use strict';

const {
	FIELD_SETS,
	SECTOR_DEPARTMENT_CODES,
	TEMPLATE_NAMES,
	buildAssignments,
} = require('../../../db/seeds/seedFormTemplates');

test('assigns sector-specific templates by stable department code and a general fallback to every other department', () => {
	const departments = [
		{ id: 5, code: 'EDUCATION' },
		{ id: 13, code: 'HEALTH' },
		{ id: 32, code: 'PUBLIC_HEALTH_ENGINEERING' },
		{ id: 1, code: 'AGRICULTURE_SUPPLY_PRICES' },
	];

	expect(buildAssignments(departments)).toEqual([
		{ departmentId: 5, departmentCode: 'EDUCATION', sector: 'education' },
		{ departmentId: 13, departmentCode: 'HEALTH', sector: 'health' },
		{ departmentId: 32, departmentCode: 'PUBLIC_HEALTH_ENGINEERING', sector: 'infrastructure' },
		{ departmentId: 1, departmentCode: 'AGRICULTURE_SUPPLY_PRICES', sector: 'general' },
	]);
});

test('each checklist has unique ordered keys and valid field types', () => {
	const validTypes = new Set(['text', 'number', 'boolean', 'select', 'multiselect', 'date', 'photo']);

	for (const fields of Object.values(FIELD_SETS)) {
		expect(fields.length).toBeGreaterThan(0);
		expect(new Set(fields.map((field) => field.fieldKey)).size).toBe(fields.length);
		fields.forEach((field, index) => {
			expect(validTypes.has(field.fieldType)).toBe(true);
			expect(field.isRequired === true || field.isRequired === undefined).toBe(true);
			expect(index).toBe(fields.findIndex((candidate) => candidate.fieldKey === field.fieldKey));
		});
	}
});

test('every configured sector has a template name and at least one department mapping', () => {
	for (const sector of Object.keys(SECTOR_DEPARTMENT_CODES)) {
		expect(TEMPLATE_NAMES[sector]).toEqual(expect.any(String));
		expect(SECTOR_DEPARTMENT_CODES[sector].length).toBeGreaterThan(0);
	}
	expect(TEMPLATE_NAMES.general).toBe('General Site Visit Checklist');
});