/**
 * One-shot: append the `budgetPick` (budget_picker) field to grant_note and
 * programme_design field_schemas if it's missing. The seed migration
 * (migrate-doc-type-schema.ts) only initialises field_schema when a row is
 * brand-new — existing rows keep their admin-edited schema — so this script
 * is the way to land the new optional field on already-deployed envs.
 *
 * Idempotent. Safe to re-run; only inserts when the field isn't already there.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/add-budget-picker-to-existing-doc-types.ts
 */

import { neon } from '@neondatabase/serverless';

type Field = {
  key: string;
  type: string;
  [k: string]: unknown;
};

const TARGETS = ['grant_note', 'programme_design'];
const NEW_FIELD: Field = {
  key: 'budgetPick',
  label: 'Linked budget (optional)',
  type: 'budget_picker',
  group: 'grant',
};

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);

  for (const key of TARGETS) {
    const rows = await sql`SELECT field_schema FROM doc_types WHERE key = ${key}`;
    if (rows.length === 0) {
      console.log(`[${key}] not present — skipping`);
      continue;
    }
    const schema = (rows[0].field_schema as Field[]) ?? [];
    if (schema.some((f) => f.key === NEW_FIELD.key || f.type === 'budget_picker')) {
      console.log(`[${key}] already has a budget_picker — skipping`);
      continue;
    }
    // Insert just before the staffNotes field if it exists (so the linked
    // budget shows up alongside the other grant fields, not after the long
    // narrative textarea). Otherwise append.
    const i = schema.findIndex((f) => f.key === 'staffNotes');
    const next = i >= 0
      ? [...schema.slice(0, i), NEW_FIELD, ...schema.slice(i)]
      : [...schema, NEW_FIELD];
    await sql`
      UPDATE doc_types
      SET field_schema = ${JSON.stringify(next)}::jsonb,
          updated_at = now()
      WHERE key = ${key}
    `;
    console.log(`[${key}] added budget_picker field`);
  }
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
