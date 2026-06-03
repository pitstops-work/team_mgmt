/**
 * Phase 3 migration — sticky scope per note on REVIEW_DATABASE_URL.
 *
 * Idempotent. Safe to re-run.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/migrate-orchestrator.ts
 */

import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);

  console.log('[orchestrator] creating grant_note_scope…');
  await sql`
    CREATE TABLE IF NOT EXISTS grant_note_scope (
      note_id uuid PRIMARY KEY,
      capability_ids text[] NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    )
  `;

  console.log('[orchestrator] done.');
}

main().catch(e => { console.error(e); process.exit(1); });
