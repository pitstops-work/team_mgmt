// ONE-SHOT MIGRATION RUNNER.
//
// Built so the 6 phase migrations can be applied against a Vercel-managed
// Neon database whose connection string is marked Sensitive (and therefore
// can't be read out for a local `npx tsx` invocation).
//
// Vercel injects REVIEW_DATABASE_URL into this function at runtime; the
// migration SQL runs server-side and the secret never leaves the platform.
//
// Auth: POST with header  x-admin-passphrase: $STAFF_PASSPHRASE
// All migrations are idempotent — safe to re-run.
//
// DELETE THIS FILE after the migrations have run successfully.

import { sql, ok, bad } from '@/lib/review/db';
import {
  DEFAULT_LANGUAGE_RULES,
  DEFAULT_FINANCIAL_RULES,
  DEFAULT_TEMPLATE_RULES,
  DEFAULT_COST_NORMS,
} from '@/lib/review/rulebook';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── Phase 0: pgvector + source_chunks ───────────────────────────────────────

async function migratePhase0() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS source_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id uuid NOT NULL,
      doc_url text NOT NULL,
      doc_name text NOT NULL,
      chunk_index int NOT NULL,
      chunk_text text NOT NULL,
      embedding vector(1024),
      metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(note_id, doc_url, chunk_index)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS source_chunks_note_idx    ON source_chunks(note_id)`;
  await sql`CREATE INDEX IF NOT EXISTS source_chunks_doc_url_idx ON source_chunks(note_id, doc_url)`;
  await sql`
    CREATE INDEX IF NOT EXISTS source_chunks_embedding_idx
      ON source_chunks USING hnsw (embedding vector_cosine_ops)
  `;
}

// ── Phase 1: grant_note_versions ────────────────────────────────────────────

async function migratePhase1() {
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
  await sql`
    CREATE INDEX IF NOT EXISTS grant_note_versions_note_idx
      ON grant_note_versions(note_id, version_number DESC)
  `;
}

// ── Phase 2: capabilities table + seed 6 built-ins ──────────────────────────

const FORMAT_DEFAULT = `OUTPUT FORMAT — HTML for section content:

Allowed HTML elements only:
- <p> <strong> <em> <ul> <ol> <li>
- <table class="data-table"><thead><tbody><tr><th><td> — reproduce tables from source documents exactly
- <div class="stat-row"><div class="stat-item"><span class="stat-val">X</span><span class="stat-label">Y</span></div></div> — for key number callouts
- <figure class="doc-image"><img src="BLOB_URL" alt="…" /><figcaption>…</figcaption></figure> — when you have the blob URL of an embedded image
- <div class="image-ref"><div class="image-ref-label">Title</div><p class="image-ref-desc">…</p></div> — when describing an image without a URL

Do not introduce <script>, <style>, inline event handlers, or any other tags.
Do not add section titles or headings inside a section's content unless the instruction explicitly asks for one.
Return ONLY the HTML — no JSON, no markdown fences, no commentary before or after.`;

const COMPLIANCE_DEFAULT = `COMPLIANCE DOCUMENT CHECK — for due-diligence document validation:

Assess whether the attached document:
1. Matches or supports the partner's stated responses
2. Contains the key information expected for this compliance check
3. Has any issues, gaps, or inconsistencies with what was claimed

Status values:
- "pass" — document supports the responses and is in order
- "partial" — document is relevant but incomplete or partially matches
- "fail" — document contradicts the responses, is the wrong document, or is missing critical information

Keep flags concise and to actual issues only. Empty flags array if nothing to flag.`;

const CAPABILITY_SEEDS = [
  { id: 'language',   label: 'Language',    category: 'language',   description: 'Tone, forbidden adjectives, specificity, first-person voice. Applied to every generation.',           prompt_fragment: DEFAULT_LANGUAGE_RULES },
  { id: 'financial',  label: 'Financial',   category: 'financial',  description: 'Opex calculation, dependency ratio, donor diversity, statutory, budget breakdown, cost per beneficiary.', prompt_fragment: DEFAULT_FINANCIAL_RULES },
  { id: 'structure',  label: 'Structure',   category: 'structure',  description: 'Document template — section ordering, required rows, header block.',                                    prompt_fragment: DEFAULT_TEMPLATE_RULES },
  { id: 'format',     label: 'Format',      category: 'format',     description: 'HTML element whitelist for section content. Sanitises output for the design editor.',                  prompt_fragment: FORMAT_DEFAULT },
  { id: 'cost',       label: 'Cost norms',  category: 'cost',       description: 'Per-theme cost norms — flag if cost-per-beneficiary is outside range.',                                prompt_fragment: DEFAULT_COST_NORMS },
  { id: 'compliance', label: 'Compliance',  category: 'compliance', description: 'Due-diligence document validation — pass/partial/fail with flags.',                                    prompt_fragment: COMPLIANCE_DEFAULT },
];

const RULEBOOK_TO_CAPABILITY: Record<string, string> = {
  language: 'language',
  financial: 'financial',
  template: 'structure',
  cost_norms: 'cost',
};

async function migratePhase2() {
  await sql`
    CREATE TABLE IF NOT EXISTS capabilities (
      id text PRIMARY KEY,
      label text NOT NULL,
      category text NOT NULL,
      description text NOT NULL,
      prompt_fragment text NOT NULL,
      config_json jsonb NOT NULL DEFAULT '{}',
      built_in boolean NOT NULL,
      archived_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  for (const c of CAPABILITY_SEEDS) {
    await sql`
      INSERT INTO capabilities
        (id, label, category, description, prompt_fragment, config_json, built_in)
      VALUES
        (${c.id}, ${c.label}, ${c.category}, ${c.description},
         ${c.prompt_fragment}, '{}'::jsonb, true)
      ON CONFLICT (id) DO NOTHING
    `;
  }
  let importedOverrides = 0;
  try {
    const overrides = await sql`SELECT section, content FROM rulebook_rules`;
    for (const r of overrides as Array<{ section: string; content: string }>) {
      const capId = RULEBOOK_TO_CAPABILITY[r.section];
      if (!capId) continue;
      const result = await sql`
        UPDATE capabilities
        SET prompt_fragment = ${r.content}, updated_at = now()
        WHERE id = ${capId} AND prompt_fragment <> ${r.content}
        RETURNING id
      `;
      if (result.length > 0) importedOverrides += 1;
    }
  } catch (e: any) {
    if (!/relation .* does not exist/i.test(e?.message || '')) throw e;
  }
  return { imported_overrides: importedOverrides };
}

// ── Phase 3: grant_note_scope ───────────────────────────────────────────────

async function migratePhase3() {
  await sql`
    CREATE TABLE IF NOT EXISTS grant_note_scope (
      note_id uuid PRIMARY KEY,
      capability_ids text[] NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    )
  `;
}

// ── Phase 5: doc_types schema + email doc_type ──────────────────────────────

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
  { key: 'orgName',    label: 'Organisation (optional)', type: 'text',     group: 'context', placeholder: 'Used for DD lookup + cross-note retrieval' },
  { key: 'subject',    label: 'Subject',                 type: 'text',     group: 'context' },
  { key: 'staffNotes', label: 'Our take',                type: 'textarea', group: 'narrative', rows: 4,
    placeholder: "Optional — anything not obvious from documents that should shape the draft" },
];

const DOC_TYPE_SEEDS = [
  { key: 'grant_note',       label: 'Grant note',         sections_mode: 'multi_section',  default_capability_ids: ['language', 'structure', 'format', 'financial', 'cost'], field_schema: GRANT_NOTE_FIELDS,       sort_order: 1 },
  { key: 'programme_design', label: 'Programme design',   sections_mode: 'multi_section',  default_capability_ids: ['language', 'structure', 'format'],                       field_schema: PROGRAMME_DESIGN_FIELDS, sort_order: 2 },
  { key: 'email',            label: 'Email / short note', sections_mode: 'single_section', default_capability_ids: ['language', 'format'],                                    field_schema: EMAIL_FIELDS,            sort_order: 3 },
];

async function migratePhase5() {
  await sql`ALTER TABLE doc_types ADD COLUMN IF NOT EXISTS field_schema jsonb NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE doc_types ADD COLUMN IF NOT EXISTS default_capability_ids text[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE doc_types ADD COLUMN IF NOT EXISTS sections_mode text NOT NULL DEFAULT 'multi_section'`;

  for (const s of DOC_TYPE_SEEDS) {
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
         ${s.sort_order})
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
}

// ── Phase 6: instruction_log ────────────────────────────────────────────────

async function migratePhase6() {
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
  await sql`CREATE INDEX IF NOT EXISTS instruction_log_normalized_idx ON instruction_log(normalized)`;
  await sql`CREATE INDEX IF NOT EXISTS instruction_log_created_idx   ON instruction_log(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS instruction_log_promoted_idx  ON instruction_log(was_promoted_to) WHERE was_promoted_to IS NOT NULL`;
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (req.headers.get('x-admin-passphrase') !== process.env.STAFF_PASSPHRASE) {
    return bad('Unauthorized', 401);
  }
  if (!process.env.REVIEW_DATABASE_URL) {
    return bad('REVIEW_DATABASE_URL not configured on this deployment', 500);
  }

  const steps: Array<{ phase: string; status: 'ok' | 'error'; note?: string; error?: string }> = [];

  type Task = { phase: string; run: () => Promise<unknown> };
  const tasks: Task[] = [
    { phase: 'phase_0_source_chunks',     run: migratePhase0 },
    { phase: 'phase_1_versions',          run: migratePhase1 },
    { phase: 'phase_2_capabilities',      run: migratePhase2 },
    { phase: 'phase_3_orchestrator_scope',run: migratePhase3 },
    { phase: 'phase_5_doc_type_schema',   run: migratePhase5 },
    { phase: 'phase_6_instruction_log',   run: migratePhase6 },
  ];

  for (const t of tasks) {
    try {
      const note = await t.run();
      steps.push({
        phase: t.phase,
        status: 'ok',
        note: typeof note === 'object' && note !== null ? JSON.stringify(note) : undefined,
      });
    } catch (e: any) {
      steps.push({ phase: t.phase, status: 'error', error: e?.message || String(e) });
      return ok({ steps, halted_at: t.phase }, { status: 500 });
    }
  }

  return ok({ steps, halted_at: null });
}
