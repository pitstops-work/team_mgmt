/**
 * Phase 5 migration — extends doc_types with schema-driven fields + default
 * capability bundle + sections_mode. Seeds grant_note + programme_design
 * field schemas (faithful to today's hardcoded form) and adds a new email
 * doc_type for the "just write a short note / email" flow.
 *
 * Idempotent. Safe to re-run.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/migrate-doc-type-schema.ts
 */

import { neon } from '@neondatabase/serverless';

type Field = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number';
  group?: string;
  placeholder?: string;
  rows?: number;
  options?: string[];
  required?: boolean;
};

const GRANT_NOTE_FIELDS: Field[] = [
  { key: 'meeting',          label: 'Meeting',                type: 'text',     group: 'context', placeholder: "30th Apr'26 SGM" },
  { key: 'orgName',          label: 'Organisation',           type: 'text',     group: 'context', placeholder: 'Deepti Foundation', required: true },
  { key: 'orgCity',          label: 'City',                   type: 'text',     group: 'context', placeholder: 'Bangalore' },
  { key: 'theme',            label: 'Theme',                  type: 'select',   group: 'context', options: [
      'Adolescent Girls', 'Rural Livelihoods', 'Access to Justice',
      'Early Childhood', 'Urban Livelihoods', 'Health', 'Education', 'Welfare & Rights', 'Other',
    ] },
  { key: 'geography',        label: 'Geography',              type: 'text',     group: 'context', placeholder: 'Bhalaswa Dairy, North Delhi' },
  { key: 'presentedBy',      label: 'Presented by',           type: 'text',     group: 'people',  placeholder: 'Kiran P' },
  { key: 'visitedBy',        label: 'Visited by',             type: 'text',     group: 'people',  placeholder: 'Kiran, Vishnu' },
  { key: 'progVisitDate',    label: 'Programme visit date',   type: 'text',     group: 'dates',   placeholder: '1st February 2026' },
  { key: 'finVisitDate',     label: 'Finance visit date',     type: 'text',     group: 'dates',   placeholder: '9th April 2026' },
  { key: 'grmDate',          label: 'GRM / Debrief date',     type: 'text',     group: 'dates',   placeholder: '31st March 2026' },
  { key: 'delayRationale',   label: 'Rationale for delay',    type: 'text',     group: 'dates',   placeholder: 'NA' },
  { key: 'grantAmount',      label: 'Grant amount',           type: 'text',     group: 'grant',   placeholder: '₹ 74.64 L' },
  { key: 'grantDuration',    label: 'Duration (years)',       type: 'number',   group: 'grant',   placeholder: '3' },
  { key: 'grantNumber',      label: 'Grant number',           type: 'select',   group: 'grant',   options: ['1st', '2nd', '3rd'] },
  { key: 'beneficiaryCount', label: 'Beneficiary count',      type: 'text',     group: 'grant',   placeholder: '~500 adolescent girls' },
  { key: 'isRenewal',        label: 'Renewal grant',          type: 'checkbox', group: 'grant' },
  { key: 'staffNotes',       label: 'Our sense of the org',   type: 'textarea', group: 'narrative', rows: 8, required: true,
    placeholder: 'Field observations, concerns, relationship history, recommendation. This is what the AI cannot read from documents.' },
];

const PROGRAMME_DESIGN_FIELDS: Field[] = [
  { key: 'meeting',        label: 'Meeting',                type: 'text',     group: 'context' },
  { key: 'programmeName',  label: 'Programme / concept name', type: 'text',   group: 'context', placeholder: 'Urban Food Distribution — Bangalore' },
  { key: 'orgName',        label: 'Implementation partner', type: 'text',     group: 'context', placeholder: 'Sampark', required: true },
  { key: 'orgCity',        label: 'City',                   type: 'text',     group: 'context' },
  { key: 'vendors',        label: 'Key vendors / partners', type: 'text',     group: 'context', placeholder: 'Ramani Food, JustDelivery' },
  { key: 'theme',          label: 'Theme',                  type: 'text',     group: 'context' },
  { key: 'geography',      label: 'Geography',              type: 'text',     group: 'context' },
  { key: 'presentedBy',    label: 'Presented by',           type: 'text',     group: 'people' },
  { key: 'visitedBy',      label: 'Visited by',             type: 'text',     group: 'people' },
  { key: 'progVisitDate',  label: 'Programme visit date',   type: 'text',     group: 'dates' },
  { key: 'finVisitDate',   label: 'Finance visit date',     type: 'text',     group: 'dates' },
  { key: 'grmDate',        label: 'GRM / Debrief date',     type: 'text',     group: 'dates' },
  { key: 'grantAmount',    label: 'Grant amount',           type: 'text',     group: 'grant' },
  { key: 'grantDuration',  label: 'Duration (years)',       type: 'number',   group: 'grant' },
  { key: 'scale',          label: 'Scale / daily target',   type: 'text',     group: 'programme', placeholder: '1,500 meals/day across 5 hotspots' },
  { key: 'hasPilot',       label: 'Prior pilot exists',     type: 'checkbox', group: 'programme' },
  { key: 'pilotNotes',     label: 'Pilot notes',            type: 'text',     group: 'programme' },
  { key: 'staffNotes',     label: 'Our sense of their capacity', type: 'textarea', group: 'narrative', rows: 8, required: true },
];

const EMAIL_FIELDS: Field[] = [
  { key: 'orgName',  label: 'Organisation (optional)', type: 'text',     group: 'context',
    placeholder: 'Used for DD lookup + cross-note retrieval' },
  { key: 'subject',  label: 'Subject',                 type: 'text',     group: 'context' },
  { key: 'staffNotes', label: 'Our take',              type: 'textarea', group: 'narrative', rows: 4,
    placeholder: "Optional — anything not obvious from documents that should shape the draft" },
];

const SEEDS = [
  {
    key: 'grant_note',
    label: 'Grant note',
    sections_mode: 'multi_section',
    default_capability_ids: ['language', 'structure', 'format', 'financial', 'cost'],
    field_schema: GRANT_NOTE_FIELDS,
  },
  {
    key: 'programme_design',
    label: 'Programme design',
    sections_mode: 'multi_section',
    default_capability_ids: ['language', 'structure', 'format'],
    field_schema: PROGRAMME_DESIGN_FIELDS,
  },
  {
    key: 'email',
    label: 'Email / short note',
    sections_mode: 'single_section',
    default_capability_ids: ['language', 'format'],
    field_schema: EMAIL_FIELDS,
  },
];

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);

  console.log('[doc-types] adding columns…');
  await sql`ALTER TABLE doc_types ADD COLUMN IF NOT EXISTS field_schema jsonb NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE doc_types ADD COLUMN IF NOT EXISTS default_capability_ids text[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE doc_types ADD COLUMN IF NOT EXISTS sections_mode text NOT NULL DEFAULT 'multi_section'`;

  console.log('[doc-types] seeding schemas…');
  for (const s of SEEDS) {
    // Insert if missing, else only update schema/defaults if they're currently empty
    // (don't clobber an admin's edits).
    await sql`
      INSERT INTO doc_types
        (key, label, template_rules, export_mode, apply_financial_rules,
         field_schema, default_capability_ids, sections_mode, sort_order)
      VALUES
        (${s.key}, ${s.label}, '', ${s.sections_mode === 'multi_section' ? 'structured' : 'freeflow'},
         ${s.default_capability_ids.includes('financial')},
         ${JSON.stringify(s.field_schema)}::jsonb,
         ${s.default_capability_ids as any},
         ${s.sections_mode},
         ${s.key === 'grant_note' ? 1 : s.key === 'programme_design' ? 2 : 3})
      ON CONFLICT (key) DO UPDATE SET
        field_schema = CASE
          WHEN doc_types.field_schema = '[]'::jsonb THEN EXCLUDED.field_schema
          ELSE doc_types.field_schema
        END,
        default_capability_ids = CASE
          WHEN doc_types.default_capability_ids = '{}'::text[] THEN EXCLUDED.default_capability_ids
          ELSE doc_types.default_capability_ids
        END,
        sections_mode = CASE
          WHEN doc_types.sections_mode IS NULL OR doc_types.sections_mode = '' THEN EXCLUDED.sections_mode
          ELSE doc_types.sections_mode
        END,
        updated_at = now()
    `;
  }

  console.log('[doc-types] done.');
}

main().catch(e => { console.error(e); process.exit(1); });
