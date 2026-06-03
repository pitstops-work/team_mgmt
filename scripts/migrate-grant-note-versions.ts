/**
 * Phase 1 migration — creates grant_note_versions on REVIEW_DATABASE_URL.
 *
 * Shadow-write only at this phase: routes will start writing version rows
 * after every mutation, but nothing reads them yet.
 *
 * Idempotent. Safe to re-run.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/migrate-grant-note-versions.ts
 */

import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);

  console.log('[versions] creating grant_note_versions…');
  await sql`
    CREATE TABLE IF NOT EXISTS grant_note_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id uuid NOT NULL,
      version_number int NOT NULL,
      parent_version_id uuid REFERENCES grant_note_versions(id),
      snapshot_json jsonb NOT NULL,
      instruction text,
      scope_used text[] NOT NULL DEFAULT '{}',
      capability_calls jsonb NOT NULL DEFAULT '[]',
      key_remap jsonb NOT NULL DEFAULT '{}',
      trigger text NOT NULL,
      created_by text NOT NULL DEFAULT 'system',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(note_id, version_number)
    )
  `;

  console.log('[versions] creating indexes…');
  await sql`
    CREATE INDEX IF NOT EXISTS grant_note_versions_note_idx
      ON grant_note_versions(note_id, version_number DESC)
  `;

  console.log('[versions] done.');
}

main().catch(e => { console.error(e); process.exit(1); });
