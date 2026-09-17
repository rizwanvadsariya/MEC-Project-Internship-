/** Loads the department form templates from 0005_form_templates_seed.sql-equivalent
 *  data. Safe to re-run; upserts on (department_id, name, version). */
'use strict';

const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const VERSION = 1;

const FIELD_SETS = {
	general: [
		{ fieldKey: 'site_condition', label: 'Overall site condition', fieldType: 'select', options: ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'CRITICAL'], isRequired: true },
		{ fieldKey: 'work_progress_summary', label: 'Work progress summary', fieldType: 'text', isRequired: true },
		{ fieldKey: 'delay_reason', label: 'Reason for delay', fieldType: 'text' },
		{ fieldKey: 'requires_intervention', label: 'Requires management intervention', fieldType: 'boolean', isRequired: true },
	],
	infrastructure: [
		{ fieldKey: 'project_type', label: 'Project type', fieldType: 'select', options: ['ROAD', 'BUILDING', 'WATER_SUPPLY', 'DRAINAGE', 'IRRIGATION', 'ENERGY', 'OTHER'], isRequired: true },
		{ fieldKey: 'work_stage', label: 'Current work stage', fieldType: 'select', options: ['NOT_STARTED', 'FOUNDATION', 'STRUCTURE', 'FINISHING', 'COMMISSIONING', 'COMPLETED'], isRequired: true },
		{ fieldKey: 'work_quality', label: 'Observed work quality', fieldType: 'select', options: ['GOOD', 'ACCEPTABLE', 'POOR', 'NOT_ASSESSED'], isRequired: true },
		{ fieldKey: 'safety_compliance', label: 'Safety requirements are being followed', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'materials_available', label: 'Required materials are available', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'labor_on_site', label: 'Workers present on site', fieldType: 'number' },
		{ fieldKey: 'estimated_completion_date', label: 'Estimated completion date', fieldType: 'date' },
		{ fieldKey: 'infrastructure_issues', label: 'Infrastructure issues observed', fieldType: 'text' },
	],
	health: [
		{ fieldKey: 'facility_type', label: 'Facility type', fieldType: 'select', options: ['HOSPITAL', 'RURAL_HEALTH_CENTER', 'BASIC_HEALTH_UNIT', 'DISPENSARY', 'OTHER'], isRequired: true },
		{ fieldKey: 'facility_functional', label: 'Facility is operational', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'staff_present', label: 'Staff present during visit', fieldType: 'number', isRequired: true },
		{ fieldKey: 'essential_services_available', label: 'Essential services available', fieldType: 'multiselect', options: ['OUTPATIENT', 'MATERNAL', 'CHILD_HEALTH', 'EMERGENCY', 'LABORATORY', 'PHARMACY'] },
		{ fieldKey: 'medicine_stock_available', label: 'Essential medicines are available', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'equipment_functional', label: 'Key equipment is functional', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'sanitation_condition', label: 'Sanitation condition', fieldType: 'select', options: ['GOOD', 'ACCEPTABLE', 'POOR', 'UNAVAILABLE'], isRequired: true },
		{ fieldKey: 'service_delivery_issues', label: 'Service delivery issues observed', fieldType: 'text' },
	],
	education: [
		{ fieldKey: 'school_type', label: 'School type', fieldType: 'select', options: ['PRIMARY', 'ELEMENTARY', 'SECONDARY', 'HIGHER_SECONDARY', 'OTHER'], isRequired: true },
		{ fieldKey: 'school_functional', label: 'School is operational', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'student_enrollment', label: 'Enrolled students', fieldType: 'number', isRequired: true },
		{ fieldKey: 'teachers_present', label: 'Teachers present during visit', fieldType: 'number', isRequired: true },
		{ fieldKey: 'classrooms_usable', label: 'Usable classrooms', fieldType: 'number', isRequired: true },
		{ fieldKey: 'water_available', label: 'Safe drinking water is available', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'sanitation_available', label: 'Usable sanitation facilities are available', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'electricity_available', label: 'Electricity is available', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'learning_materials_available', label: 'Learning materials are available', fieldType: 'boolean', isRequired: true },
		{ fieldKey: 'education_issues', label: 'Education issues observed', fieldType: 'text' },
	],
};

const SECTOR_DEPARTMENT_CODES = {
	education: ['EDUCATION'],
	health: ['HEALTH'],
	infrastructure: [
		'ENERGY',
		'HUMAN_SETTLEMENT',
		'IRRIGATION',
		'LOCAL_GOVERNMENT',
		'PUBLIC_HEALTH_ENGINEERING',
		'THAR_COAL_INFRASTRUCTURE',
		'TRANSPORT_MASS_TRANSIT',
		'WORKS_SERVICES',
	],
};

const TEMPLATE_NAMES = {
	general: 'General Site Visit Checklist',
	infrastructure: 'Infrastructure Site Visit Checklist',
	health: 'Health Facility Site Visit Checklist',
	education: 'Education Facility Site Visit Checklist',
};

function buildAssignments(departments) {
	const codeToSector = new Map();
	for (const [sector, codes] of Object.entries(SECTOR_DEPARTMENT_CODES)) {
		for (const code of codes) codeToSector.set(code, sector);
	}

	return departments.map((department) => ({
		departmentId: department.id,
		departmentCode: department.code,
		sector: codeToSector.get(department.code) || 'general',
	}));
}

async function seedFormTemplates(client) {
	const { rows: departments } = await client.query(
		'select id, code from departments where code is not null order by id',
	);
	const departmentCodes = new Set(departments.map((department) => department.code));
	const expectedCodes = Object.values(SECTOR_DEPARTMENT_CODES).flat();
	const missingCodes = expectedCodes.filter((code) => !departmentCodes.has(code));
	if (missingCodes.length) {
		throw new Error(`Missing required department codes: ${missingCodes.join(', ')}`);
	}

	const assignments = buildAssignments(departments);
	for (const assignment of assignments) {
		const templateName = TEMPLATE_NAMES[assignment.sector];
		const templateResult = await client.query(
			`insert into form_templates (department_id, name, version, is_active)
			 values ($1, $2, $3, true)
			 on conflict (department_id, name, version)
			 do update set is_active = true
			 returning id`,
			[assignment.departmentId, templateName, VERSION],
		);
		const templateId = templateResult.rows[0].id;
		await client.query('delete from form_template_fields where template_id = $1', [templateId]);

		for (const [sortIndex, field] of FIELD_SETS[assignment.sector].entries()) {
			await client.query(
				`insert into form_template_fields
				 (template_id, field_key, label, field_type, options, is_required, sort_order)
				 values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
				[
					templateId,
					field.fieldKey,
					field.label,
					field.fieldType,
					field.options ? JSON.stringify(field.options) : null,
					field.isRequired === true,
					sortIndex,
				],
			);
		}
	}

	return assignments;
}

async function main() {
	const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
	if (!connectionString || connectionString.includes('REPLACE_ME')) {
		throw new Error('DIRECT_URL / DATABASE_URL is not set in backend/.env');
	}

	const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
	try {
		await client.connect();
		await client.query('begin');
		const assignments = await seedFormTemplates(client);
		await client.query('commit');
		const counts = assignments.reduce((result, assignment) => {
			result[assignment.sector] = (result[assignment.sector] || 0) + 1;
			return result;
		}, {});
		console.log(`Seeded ${assignments.length} department form templates: ${JSON.stringify(counts)}`);
	} catch (error) {
		await client.query('rollback').catch(() => {});
		throw error;
	} finally {
		await client.end();
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}

module.exports = {
	FIELD_SETS,
	SECTOR_DEPARTMENT_CODES,
	TEMPLATE_NAMES,
	buildAssignments,
	seedFormTemplates,
};
