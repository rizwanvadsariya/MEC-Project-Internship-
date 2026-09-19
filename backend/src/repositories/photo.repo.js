/**
 * visit_photos + issue_report_photos rows (storage_path, geo_lat/lng, caption).
 * The ONLY layer that talks to Postgres/Supabase. Parameterized queries, proper
 * joins (no N+1), cursor pagination on lists (architecture.md §5.1/§5.3).
 */
'use strict';
const db = require('../config/database');

async function findVisitContext(siteVisitId, actor) {
	const result = await db.query(
		`select sv.id as "siteVisitId", sv.team_id as "teamId", exists (
			select 1 from visit_team_members vtm where vtm.team_id = sv.team_id
			and vtm.user_id = $2 and vtm.team_role = 'LEAD_MEO'
		) as "isLeadMeo", coalesce(vf.status = 'SUBMITTED', false) as "formSubmitted"
		from site_visits sv
		left join visit_forms vf on vf.site_visit_id = sv.id
		where sv.id = $1 and (
			exists (select 1 from visit_team_members member_vtm where member_vtm.team_id = sv.team_id and member_vtm.user_id = $2)
			or ($3 and exists (select 1 from scheme_districts sd join districts d on d.id = sd.district_id where sd.scheme_id = sv.scheme_id and d.division_id = $4))
		)`,
		[siteVisitId, actor.id, actor.role === 'REGIONAL_DIRECTOR' || actor.role === 'DIRECTOR_GENERAL', actor.divisionId ?? null],
	);
	return result.rows[0] || null;
}

async function create(siteVisitId, uploadedBy, storagePath, metadata) {
	const result = await db.query(
		`insert into visit_photos (site_visit_id, uploaded_by, storage_path, caption, geo_lat, geo_lng, taken_at)
		 values ($1, $2, $3, $4, $5, $6, $7)
		 returning id, site_visit_id as "siteVisitId", uploaded_by as "uploadedBy", storage_path as "storagePath",
		 caption, geo_lat as "geoLat", geo_lng as "geoLng", taken_at as "takenAt", created_at as "createdAt"`,
		[siteVisitId, uploadedBy, storagePath, metadata.caption ?? null, metadata.geoLat ?? null, metadata.geoLng ?? null, metadata.takenAt ?? null],
	);
	return result.rows[0];
}

async function list(siteVisitId) {
	const result = await db.query(
		`select id, site_visit_id as "siteVisitId", uploaded_by as "uploadedBy", storage_path as "storagePath",
				caption, geo_lat as "geoLat", geo_lng as "geoLng", taken_at as "takenAt", created_at as "createdAt"
		 from visit_photos where site_visit_id = $1 order by created_at desc`,
		[siteVisitId],
	);
	return result.rows;
}

async function findById(siteVisitId, photoId) {
	const result = await db.query(
		`select id, site_visit_id as "siteVisitId", storage_path as "storagePath"
		 from visit_photos where id = $1 and site_visit_id = $2`,
		[photoId, siteVisitId],
	);
	return result.rows[0] || null;
}

async function remove(photoId) {
	await db.query('delete from visit_photos where id = $1', [photoId]);
}

module.exports = { findVisitContext, create, list, findById, remove };
