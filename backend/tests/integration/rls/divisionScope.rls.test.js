/** RLS: a direct DB connection as an RD in division A is denied SELECT on
 *  division B rows even when the API layer is bypassed (architecture.md §6).
 *  Runs against the disposable test DB set up by tests/globalSetup.js — see
 *  tests/helpers/pgTestClient.js for why it isn't run against real Supabase. */
'use strict';

const { dbAvailable, getClient, asUser, asAnon } = require('../../helpers/pgTestClient');
const { createFixtures, cleanupFixtures } = require('../../helpers/rlsFixtures');

const maybeDescribe = dbAvailable() ? describe : describe.skip;

maybeDescribe('RLS: division scoping', () => {
  let client;
  let f;

  beforeAll(async () => {
    client = await getClient();
    f = await createFixtures(client);
  });

  afterAll(async () => {
    await cleanupFixtures(client, f);
    await client.end();
  });

  test.each([
    ['DIRECTOR_GENERAL', () => f.dg],
    ['REGIONAL_DIRECTOR', () => f.rd],
    ['MEO', () => f.meo],
  ])('%s sees their own division scheme but not the other division', async (_role, getUserId) => {
    await asUser(client, getUserId(), async () => {
      const own = await client.query('select id from schemes where id = $1', [f.schemeA]);
      const other = await client.query('select id from schemes where id = $1', [f.schemeB]);
      expect(own.rows).toHaveLength(1);
      expect(other.rows).toHaveLength(0);
    });
  });

  test('SUPPORT_USER browses schemes in both divisions (open read)', async () => {
    await asUser(client, f.support, async () => {
      const rows = await client.query('select id from schemes where id in ($1, $2)', [f.schemeA, f.schemeB]);
      expect(rows.rows).toHaveLength(2);
    });
  });

  test('RD sees users in their own division but not SUPPORT_USER (division is null)', async () => {
    await asUser(client, f.rd, async () => {
      const rows = await client.query('select id from users where id in ($1,$2,$3,$4)', [f.dg, f.rd, f.meo, f.support]);
      const ids = rows.rows.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([f.dg, f.rd, f.meo]));
      expect(ids).not.toContain(f.support);
    });
  });

  test('SUPPORT_USER sees only themself in the users table', async () => {
    await asUser(client, f.support, async () => {
      const rows = await client.query('select id from users where id in ($1,$2,$3,$4)', [f.dg, f.rd, f.meo, f.support]);
      expect(rows.rows.map((r) => r.id)).toEqual([f.support]);
    });
  });

  test('RD sees the team/site visit in their division but not the other division', async () => {
    await asUser(client, f.rd, async () => {
      const teams = await client.query('select id from visit_teams where id in ($1,$2)', [f.teamA, f.teamB]);
      expect(teams.rows.map((r) => r.id)).toEqual([f.teamA]);

      const visits = await client.query('select id from site_visits where id in ($1,$2)', [f.visitA, f.visitB]);
      expect(visits.rows.map((r) => r.id)).toEqual([f.visitA]);
    });
  });

  test('MEO sees the team/visit they are on, not the other division\'s', async () => {
    await asUser(client, f.meo, async () => {
      const teams = await client.query('select id from visit_teams where id in ($1,$2)', [f.teamA, f.teamB]);
      expect(teams.rows.map((r) => r.id)).toEqual([f.teamA]);
    });
  });

  test('anon role gets nothing from schemes — either zero rows or denied outright (its grants were revoked in migration 0006)', async () => {
    await asAnon(client, async () => {
      try {
        const rows = await client.query('select id from schemes where id in ($1,$2)', [f.schemeA, f.schemeB]);
        expect(rows.rows).toHaveLength(0);
      } catch (err) {
        expect(err.message).toMatch(/permission denied/i);
      }
    });
  });
});
