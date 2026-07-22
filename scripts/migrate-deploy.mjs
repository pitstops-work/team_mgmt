// Runs `prisma migrate deploy` with retries. Two-step:
//
//   1. Fast pre-check via `pg` — if _prisma_migrations already carries every
//      folder under prisma/migrations with a non-null finished_at, we skip
//      prisma entirely. Bypasses Prisma's fixed 10s advisory-lock timeout
//      (P1002), which flakes on Neon's direct endpoint even when nothing is
//      pending (see auto-memory: neon_migrate_advisory_lock).
//
//   2. Otherwise, `prisma migrate deploy` with 4 attempts + exponential
//      backoff — the historical fallback for a cold or briefly-contested lock.
//
// Idempotent. Fails hard only if step 2 exhausts its retries.

import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");
const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 8_000;

function listMigrationNames() {
  try {
    return readdirSync(MIGRATIONS_DIR)
      .filter((n) => {
        try { return statSync(join(MIGRATIONS_DIR, n)).isDirectory(); }
        catch { return false; }
      });
  } catch {
    return [];
  }
}

async function precheckAllApplied() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return false;
  const expected = listMigrationNames();
  if (expected.length === 0) return true;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  try {
    await client.connect();
    await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
    const { rows } = await client.query(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const applied = new Set(rows.map((r) => r.migration_name));
    const missing = expected.filter((n) => !applied.has(n));
    if (missing.length === 0) {
      console.log(`[migrate-deploy] pre-check: all ${expected.length} migrations already applied; skipping prisma migrate deploy.`);
      return true;
    }
    console.log(`[migrate-deploy] pre-check: ${missing.length} pending — ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}. Running prisma migrate deploy.`);
    return false;
  } catch (e) {
    console.error(`[migrate-deploy] pre-check failed: ${e?.message ?? e}. Falling through to prisma migrate deploy.`);
    return false;
  } finally {
    try { await client.end(); } catch {}
  }
}

const ATTEMPTS = 4;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (await precheckAllApplied()) process.exit(0);
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      execSync("npx prisma migrate deploy", { stdio: "inherit" });
      process.exit(0);
    } catch {
      console.error(`[migrate-deploy] attempt ${i}/${ATTEMPTS} failed`);
      if (i === ATTEMPTS) process.exit(1);
      await delay(8000 * i);
    }
  }
}
main();
