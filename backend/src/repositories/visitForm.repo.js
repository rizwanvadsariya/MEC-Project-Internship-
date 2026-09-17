/**
 * visit_forms read/write incl. GIN-indexed jsonb responses.
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';

const db = require('../config/database');

const DIVISION_ROLES = new Set(['REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL']);

function visibilityClause(actor, params, alias = 'sv') {
	params.push(DIVISION_ROLES.has(actor.role));
	const divisionScopedIndex = params.length;
	params.push(actor.divisionId ?? null);
	const divisionIndex = params.length;
	params.push(actor.id);
	const userIndex = params.length;
	return `(
		($${divisionScopedIndex} and exists (
			select 1 from scheme_districts sd join districts d on d.id = sd.district_id
			where sd.scheme_id = ${alias}.scheme_id and d.division_id = $${divisionIndex}
		))
		or exists (select 1 from visit_team_members vtm where vtm.team_id = ${alias}.team_id and vtm.user_id = $${userIndex})
	)`;
}

async function findContext(siteVisitId, actor) {
	const params = [];
	const visibility = visibilityClause(actor, params);
	const actorIndex = params.length;
	params.push(siteVisitId);
	const result = await db.query(
		`select sv.id as "siteVisitId", s.department_id as "departmentId",
				exists (select 1 from visit_team_members lead_vtm
					where lead_vtm.team_id = sv.team_id and lead_vtm.user_id = $${actorIndex}
					and lead_vtm.team_role = 'LEAD_MEO') as "isLeadMeo"
		 from site_visits sv join schemes s on s.id = sv.scheme_id
		 where sv.id = $${params.length} and ${visibility}`,
		params,
	);
	return result.rows[0] || null;
}

async function findTemplate(departmentId) {
	const result = await db.query(
		`select ft.id, ft.department_id as "departmentId", ft.name, ft.version,
				ftf.id as "fieldId", ftf.field_key as "fieldKey", ftf.label,
				ftf.field_type as "fieldType", ftf.options, ftf.is_required as "isRequired",
				ftf.sort_order as "sortOrder"
		 from form_templates ft
		 left join form_template_fields ftf on ftf.template_id = ft.id
		 where ft.department_id = $1 and ft.is_active = true
		 order by ft.version desc, ftf.sort_order asc`,
		[departmentId],
	);
	if (!result.rows.length) return null;
	const first = result.rows[0];
	return {
		id: first.id,
		departmentId: first.departmentId,
		name: first.name,
		version: first.version,
		fields: result.rows.filter((row) => row.fieldId).map(({ fieldId, fieldKey, label, fieldType, options, isRequired, sortOrder }) => ({
			id: fieldId, fieldKey, label, fieldType, options, isRequired, sortOrder,
		})),
	};
}

async function findForm(siteVisitId) {
	const result = await db.query(
		`select id, site_visit_id as "siteVisitId", template_id as "templateId", filled_by as "filledBy",
				status, physical_progress_pct as "physicalProgressPct", remarks, responses,
				created_at as "createdAt", updated_at as "updatedAt"
		 from visit_forms where site_visit_id = $1`,
		[siteVisitId],
	);
	return result.rows[0] || null;
}

async function save(siteVisitId, actorId, templateId, payload, status) {
	const result = await db.query(
		`insert into visit_forms (site_visit_id, template_id, filled_by, status, physical_progress_pct, remarks, responses)
		 values ($1, $2, $3, $4, $5, $6, $7::jsonb)
		 on conflict (site_visit_id) do update set
			 template_id = excluded.template_id,
			 filled_by = excluded.filled_by,
			 status = excluded.status,
			 physical_progress_pct = excluded.physical_progress_pct,
			 remarks = excluded.remarks,
			 responses = excluded.responses
		 returning id, site_visit_id as "siteVisitId", template_id as "templateId", filled_by as "filledBy",
			 status, physical_progress_pct as "physicalProgressPct", remarks, responses,
			 created_at as "createdAt", updated_at as "updatedAt"`,
		[siteVisitId, templateId, actorId, status, payload.physicalProgressPct, payload.remarks ?? null, JSON.stringify(payload.responses)],
	);
	return result.rows[0];
}

module.exports = { findContext, findTemplate, findForm, save };
