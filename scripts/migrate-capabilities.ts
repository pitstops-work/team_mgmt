/**
 * Phase 2 migration — creates the capabilities table on REVIEW_DATABASE_URL,
 * seeds 6 built-in capability rows from the existing DEFAULT_* constants,
 * and imports any rulebook_rules overrides so admin edits aren't lost.
 *
 * Idempotent. Safe to re-run — built-in rows are NOT overwritten on rerun
 * (so admin edits survive). To force-reset a built-in to defaults, archive
 * it and re-seed, or update via the admin UI.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/migrate-capabilities.ts
 */

import { neon } from '@neondatabase/serverless';
import {
  DEFAULT_LANGUAGE_RULES,
  DEFAULT_FINANCIAL_RULES,
  DEFAULT_TEMPLATE_RULES,
  DEFAULT_COST_NORMS,
  DEFAULT_CRECHE_LANGUAGE,
} from '../lib/review/rulebook';

// ── Compose default prompt fragments from the existing constants ─────────────

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

const SEEDS = [
  {
    id: 'language',
    label: 'Language',
    category: 'language',
    description: 'Tone, forbidden adjectives, specificity, first-person voice. Applied to every generation.',
    prompt_fragment: DEFAULT_LANGUAGE_RULES,
    config_json: {},
  },
  {
    id: 'financial',
    label: 'Financial',
    category: 'financial',
    description: 'Opex calculation, dependency ratio, donor diversity, statutory, budget breakdown, cost per beneficiary.',
    prompt_fragment: DEFAULT_FINANCIAL_RULES,
    config_json: {},
  },
  {
    id: 'structure',
    label: 'Structure',
    category: 'structure',
    description: 'Document template — section ordering, required rows, header block.',
    prompt_fragment: DEFAULT_TEMPLATE_RULES,
    config_json: {},
  },
  {
    id: 'format',
    label: 'Format',
    category: 'format',
    description: 'HTML element whitelist for section content. Sanitises output for the design editor.',
    prompt_fragment: FORMAT_DEFAULT,
    config_json: {},
  },
  {
    id: 'cost',
    label: 'Cost norms',
    category: 'cost',
    description: 'Per-theme cost norms — flag if cost-per-beneficiary is outside range.',
    prompt_fragment: DEFAULT_COST_NORMS,
    config_json: {},
  },
  {
    id: 'compliance',
    label: 'Compliance',
    category: 'compliance',
    description: 'Due-diligence document validation — pass/partial/fail with flags.',
    prompt_fragment: COMPLIANCE_DEFAULT,
    config_json: {},
  },
  {
    id: 'creche_language',
    label: 'Creche language',
    category: 'language',
    description: 'Creche-specific language additions — title/theme conventions, D/I marker meaning, donor-history sentence, dependency formula, NFHS/POSHAN citation style, standard 6-block budget terminology. Bundled with the base language capability on creche doc types.',
    prompt_fragment: DEFAULT_CRECHE_LANGUAGE,
    config_json: {},
  },
];

// Rulebook section keys → capability ids. Lets us import old admin edits.
const RULEBOOK_TO_CAPABILITY: Record<string, string> = {
  language: 'language',
  financial: 'financial',
  template: 'structure',
  cost_norms: 'cost',
};

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);

  console.log('[capabilities] creating table…');
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

  console.log(`[capabilities] seeding ${SEEDS.length} built-in rows…`);
  for (const c of SEEDS) {
    await sql`
      INSERT INTO capabilities
        (id, label, category, description, prompt_fragment, config_json, built_in)
      VALUES
        (${c.id}, ${c.label}, ${c.category}, ${c.description},
         ${c.prompt_fragment}, ${JSON.stringify(c.config_json)}::jsonb, true)
      ON CONFLICT (id) DO NOTHING
    `;
  }

  console.log('[capabilities] importing rulebook_rules overrides (if any)…');
  let imported = 0;
  try {
    const overrides = await sql`SELECT section, content FROM rulebook_rules`;
    for (const r of overrides as Array<{ section: string; content: string }>) {
      const capId = RULEBOOK_TO_CAPABILITY[r.section];
      if (!capId) continue;
      // Only overwrite the seeded default if the row hasn't been edited via
      // the new capabilities UI since seeding.
      const result = await sql`
        UPDATE capabilities
        SET prompt_fragment = ${r.content},
            updated_at = now()
        WHERE id = ${capId}
          AND updated_at = (
            SELECT MAX(updated_at) FROM capabilities WHERE id = ${capId}
          )
          AND prompt_fragment <> ${r.content}
        RETURNING id
      `;
      if (result.length > 0) imported += 1;
    }
  } catch (e: any) {
    if (!/relation .* does not exist/i.test(e?.message || '')) throw e;
  }
  console.log(`[capabilities] imported ${imported} override(s) from rulebook_rules.`);

  console.log('[capabilities] done.');
}

main().catch(e => { console.error(e); process.exit(1); });
