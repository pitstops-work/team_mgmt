/**
 * Phase 6 migration — instruction_log on REVIEW_DATABASE_URL.
 *
 * The orchestrator writes one row per turn. The normalized column is used
 * to cluster similar instructions across notes so an admin can promote
 * recurring patterns into capabilities.
 *
 * Idempotent. Safe to re-run.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/migrate-instruction-log.ts
 */

import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);

  console.log('[instruction-log] creating table…');
  await sql`
    CREATE TABLE IF NOT EXISTS instruction_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id uuid,
      version_id uuid REFERENCES grant_note_versions(id) ON DELETE SET NULL,
      instruction text NOT NULL,
      normalized text NOT NULL,
      capabilities_used text[] NOT NULL DEFAULT '{}',
      was_promoted_to text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  console.log('[instruction-log] creating indexes…');
  await sql`CREATE INDEX IF NOT EXISTS instruction_log_normalized_idx ON instruction_log(normalized)`;
  await sql`CREATE INDEX IF NOT EXISTS instruction_log_created_idx   ON instruction_log(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS instruction_log_promoted_idx  ON instruction_log(was_promoted_to) WHERE was_promoted_to IS NOT NULL`;

  console.log('[instruction-log] done.');
}

main().catch(e => { console.error(e); process.exit(1); });
