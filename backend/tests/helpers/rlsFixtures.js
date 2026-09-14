/**
 * Fixtures for the RLS integration suite, built against the real Supabase
 * project using the 4 real seeded test accounts (db/seeds/seedTestAccounts.js)
 * — dg/rd/meo are in division 1 (Karachi), support has no division. Nothing
 * here writes to auth.users or reference tables (divisions/schemes/etc.) —
 * only operational rows (visit_teams/site_visits/comments), all removed in
 * cleanupFixtures. Uses whichever real schemes happen to be in/out of
 * division 1, looked up at run time rather than hardcoding scheme ids.
 */
'use strict';

const TEST_EMAILS = {
  dg: 'dg.test@mec.local',
  rd: 'rd.test@mec.local',
  meo: 'meo.test@mec.local',
  support: 'support.test@mec.local',
};

async function createFixtures(client) {
  const users = {};
  for (const [key, email] of Object.entries(TEST_EMAILS)) {
    const { rows } = await client.query('select id, division_id from users where email = $1', [email]);
    if (!rows[0]) throw new Error(`Seeded test account missing: ${email} — run npm run seed:accounts`);
    users[key] = rows[0].id;
  }

  // Self-heal from a previous run that crashed/got killed between creating
  // fixtures and cleaning them up (real Supabase, not a disposable DB — this
  // actually happened once during development) rather than accumulating junk.
  await client.query(
    `delete from site_visits where team_id in (select id from visit_teams where created_by = $1)`,
    [users.rd],
  );
  await client.query(
    `delete from visit_team_members where team_id in (select id from visit_teams where created_by = $1)`,
    [users.rd],
  );
  await client.query(`delete from visit_teams where created_by = $1`, [users.rd]);
  await client.query(`delete from form_templates where name = 'RLS test template'`);

  const divisionA = (await client.query('select division_id from users where email = $1', [TEST_EMAILS.dg])).rows[0].division_id;

  const schemeA = (await client.query(
    `select s.id from schemes s
     join scheme_districts sd on sd.scheme_id = s.id
     join districts d on d.id = sd.district_id
     where d.division_id = $1 limit 1`,
    [divisionA],
  )).rows[0]?.id;
  const schemeB = (await client.query(
    `select s.id from schemes s
     join scheme_districts sd on sd.scheme_id = s.id
     join districts d on d.id = sd.district_id
     where d.division_id != $1 limit 1`,
    [divisionA],
  )).rows[0]?.id;
  if (!schemeA || !schemeB) throw new Error('Need at least one scheme inside and one outside division 1 — run npm run seed:adp first');

  const teamA = (await client.query(
    `insert into visit_teams (scheme_id, created_by, version, status) values ($1, $2, 1, 'APPROVED') returning id`,
    [schemeA, users.rd],
  )).rows[0].id;
  const teamB = (await client.query(
    `insert into visit_teams (scheme_id, created_by, version, status) values ($1, $2, 1, 'APPROVED') returning id`,
    [schemeB, users.rd],
  )).rows[0].id;
  await client.query(`insert into visit_team_members (team_id, user_id, team_role) values ($1, $2, 'LEAD_MEO')`, [teamA, users.meo]);

  const visitA = (await client.query(`insert into site_visits (team_id, scheme_id, status) values ($1, $2, 'SCHEDULED') returning id`, [teamA, schemeA])).rows[0].id;
  const visitB = (await client.query(`insert into site_visits (team_id, scheme_id, status) values ($1, $2, 'SCHEDULED') returning id`, [teamB, schemeB])).rows[0].id;

  let templateId = (await client.query('select id from form_templates limit 1')).rows[0]?.id;
  let createdTemplate = false;
  if (!templateId) {
    templateId = (await client.query(
      `insert into form_templates (department_id, name, version, is_active) values (null, 'RLS test template', 1, true) returning id`,
    )).rows[0].id;
    createdTemplate = true;
  }

  return { divisionA, schemeA, schemeB, ...users, teamA, teamB, visitA, visitB, templateId, createdTemplate };
}

async function cleanupFixtures(client, f) {
  await client.query('delete from visit_forms where site_visit_id in ($1,$2)', [f.visitA, f.visitB]);
  await client.query('delete from comments where commentable_id = $1', [String(f.schemeA)]);
  await client.query('delete from site_visits where id in ($1,$2)', [f.visitA, f.visitB]);
  await client.query('delete from visit_team_members where team_id in ($1,$2)', [f.teamA, f.teamB]);
  await client.query('delete from visit_teams where id in ($1,$2)', [f.teamA, f.teamB]);
  if (f.createdTemplate) await client.query('delete from form_templates where id = $1', [f.templateId]);
}

module.exports = { createFixtures, cleanupFixtures };
