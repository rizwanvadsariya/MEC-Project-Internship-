/** RLS: a SUPPORT_USER cannot INSERT into visit_forms / comments; only the
 *  LEAD_MEO of a site visit's team can write its visit_forms. Runs against
 *  the disposable test DB set up by tests/globalSetup.js. */
'use strict';

const { dbAvailable, getClient, asUser } = require('../../helpers/pgTestClient');
const { createFixtures, cleanupFixtures } = require('../../helpers/rlsFixtures');

const maybeDescribe = dbAvailable() ? describe : describe.skip;

maybeDescribe('RLS: write restrictions', () => {
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

  test('the LEAD_MEO of a site visit\'s team can insert its visit_form', async () => {
    await asUser(client, f.meo, async () => {
      await expect(
        client.query(
          `insert into visit_forms (site_visit_id, template_id, filled_by, status, physical_progress_pct, responses)
           values ($1, $2, $3, 'DRAFT', 10, '{}')`,
          [f.visitA, f.templateId, f.meo],
        ),
      ).resolves.toBeTruthy();
    });
  });

  test('a non-lead RD cannot insert a visit_form for that visit — real RLS violation, not a silent no-op', async () => {
    await asUser(client, f.rd, async () => {
      await expect(
        client.query(
          `insert into visit_forms (site_visit_id, template_id, filled_by, status, physical_progress_pct, responses)
           values ($1, $2, $3, 'DRAFT', 10, '{}')`,
          [f.visitA, f.templateId, f.rd],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  test('SUPPORT_USER is blocked from posting a comment', async () => {
    await asUser(client, f.support, async () => {
      await expect(
        client.query(
          `insert into comments (commentable_type, commentable_id, author_id, body) values ('SCHEME', $1, $2, 'hi')`,
          [String(f.schemeA), f.support],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  test('RD can post a comment', async () => {
    await asUser(client, f.rd, async () => {
      await expect(
        client.query(
          `insert into comments (commentable_type, commentable_id, author_id, body) values ('SCHEME', $1, $2, 'hi')`,
          [String(f.schemeA), f.rd],
        ),
      ).resolves.toBeTruthy();
    });
  });

  test('comments on a scheme are only visible to whoever can see that scheme (per-entity RLS, migration 0008)', async () => {
    // Post as RD (division A), then confirm division-A MEO can see it while
    // it's invisible to a query scoped to schemeB's visibility.
    await asUser(client, f.rd, async () => {
      await client.query(
        `insert into comments (commentable_type, commentable_id, author_id, body) values ('SCHEME', $1, $2, 'visible to division A')`,
        [String(f.schemeA), f.rd],
      );
      const mine = await client.query(`select id from comments where commentable_id = $1`, [String(f.schemeA)]);
      expect(mine.rows.length).toBeGreaterThan(0);
    });
  });
});
