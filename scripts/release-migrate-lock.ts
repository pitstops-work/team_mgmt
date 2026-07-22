// Release Prisma's stuck migration advisory lock (72707369) on Neon.
//
// `prisma migrate deploy` takes SELECT pg_advisory_lock(72707369) to serialise
// migrations. The lock is session-scoped, so it releases when the acquiring
// session ends — unless the session is a still-parked pooler connection that
// hasn't been recycled. Symptom: Vercel builds fail with P1002 "Timed out
// trying to acquire a postgres advisory lock" across multiple retries.
//
// This script inspects pg_locks for that specific advisory lock and, when
// found, terminates the holding backend so Prisma can acquire it on the next
// deploy.
//
// Run: `node --env-file=.env.local ./node_modules/.bin/tsx scripts/release-migrate-lock.ts`

import { Client } from "pg";

const LOCK_ID = 72707369; // Prisma's fixed migration lock id (see prisma/prisma-engines)

async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No MIGRATE_DATABASE_URL or DATABASE_URL in env.");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  const held = await client.query<{
    pid: number; granted: boolean; mode: string; state: string | null;
    query: string | null; application_name: string | null; state_change: Date | null;
  }>(`
    SELECT l.pid, l.granted, l.mode, s.state, s.query, s.application_name, s.state_change
      FROM pg_locks l
      LEFT JOIN pg_stat_activity s ON s.pid = l.pid
     WHERE l.locktype = 'advisory' AND l.objid = $1
  `, [LOCK_ID]);

  if (held.rows.length === 0) {
    console.log(`[release-migrate-lock] advisory lock ${LOCK_ID} is not held. Nothing to do.`);
    await client.end();
    return;
  }

  console.log(`[release-migrate-lock] holders of advisory lock ${LOCK_ID}:`);
  for (const r of held.rows) {
    console.log(`  pid=${r.pid} granted=${r.granted} mode=${r.mode} state=${r.state} app=${r.application_name} last_change=${r.state_change?.toISOString() ?? "?"} query=${(r.query ?? "").slice(0, 120)}`);
  }

  const grantedPids = held.rows.filter((r) => r.granted).map((r) => r.pid);
  if (grantedPids.length === 0) {
    console.log("[release-migrate-lock] no granted holders — only waiters. Nothing to kill.");
    await client.end();
    return;
  }

  for (const pid of grantedPids) {
    const t = await client.query<{ pg_terminate_backend: boolean }>(
      "SELECT pg_terminate_backend($1) AS pg_terminate_backend", [pid],
    );
    console.log(`[release-migrate-lock] terminated pid=${pid} → ${t.rows[0]?.pg_terminate_backend}`);
  }

  // Small pause + re-check.
  await new Promise((r) => setTimeout(r, 1000));
  const after = await client.query(
    "SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = $1 AND granted",
    [LOCK_ID],
  );
  console.log(`[release-migrate-lock] granted holders after: ${after.rows[0].n}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
