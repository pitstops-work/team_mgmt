// One-shot diagnostic: dump every advisory lock, every active session, and any
// prisma-migrations row that could be blocking a migrate-deploy attempt.

import { Client } from "pg";

async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) { console.error("No DB URL"); process.exit(1); }
  const client = new Client({ connectionString: url });
  await client.connect();

  const locks = await client.query(`
    SELECT locktype, classid, objid, mode, granted, pid
      FROM pg_locks WHERE locktype = 'advisory' ORDER BY objid
  `);
  console.log(`Advisory locks: ${locks.rows.length}`);
  for (const r of locks.rows) console.log("  ", r);

  const activity = await client.query(`
    SELECT pid, application_name, state, wait_event_type, wait_event,
           now() - state_change AS since_state_change,
           substr(query, 1, 100) AS query_head
      FROM pg_stat_activity
     WHERE datname = current_database()
       AND pid <> pg_backend_pid()
     ORDER BY state, since_state_change DESC
  `);
  console.log(`\nOther sessions: ${activity.rows.length}`);
  for (const r of activity.rows) console.log("  ", r);

  const migRows = await client.query(`
    SELECT id, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations
     WHERE migration_name ILIKE '%school_plans%'
     ORDER BY started_at DESC
  `);
  console.log(`\nSchool-plans prisma-migrations rows: ${migRows.rows.length}`);
  for (const r of migRows.rows) console.log("  ", r);

  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
