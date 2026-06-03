// Orchestrator DocumentState — the canonical in-memory model of a note's
// drafting state. Load → mutate (via tool calls) → persist.

import { sql } from '../db';

export type Block = {
  id: string;
  type: 'decision' | 'assumption' | 'settled' | 'sign_off';
  text: string;
};

export type Section = {
  section_key: string;
  section_num: string;
  title: string;
  content_html: string;
  prompt_text: string;
  blocks: Block[];
  sort_order: number;
};

export type DocumentState = {
  note_id: string;
  doc_type: string;
  meta: {
    org_name: string;
    org_city: string;
    meeting: string;
    theme: string;
    grant_number: string;
    grant_amount: string;
    grant_duration: string;
    status: string;
    submitted_by: string;
  };
  vitals: Record<string, unknown>;
  diagrams: unknown[];
  draft_text: string;
  sections: Section[];
};

export type Diff = {
  added: string[];
  modified: string[];
  removed: string[];
  remapped: Array<[string, string]>;
};

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadDocumentState(noteId: string): Promise<DocumentState | null> {
  const [noteRows, sectionRows, metaRows] = await Promise.all([
    sql`
      SELECT org_name, org_city, meeting, theme, grant_number, grant_amount,
             grant_duration, doc_type, draft_text, status, submitted_by
      FROM grant_notes WHERE id = ${noteId}::uuid
    `,
    sql`
      SELECT section_key, section_num, title, content_html, prompt_text, blocks, sort_order
      FROM grant_note_sections
      WHERE note_id = ${noteId}::uuid
      ORDER BY sort_order ASC
    `.catch(() => [] as any[]),
    sql`
      SELECT vitals, diagrams
      FROM grant_note_metadata
      WHERE note_id = ${noteId}::uuid
    `.catch(() => [] as any[]),
  ]);

  if (noteRows.length === 0) return null;
  const note = noteRows[0] as any;
  const meta = (metaRows as any[])[0] || {};

  return {
    note_id: noteId,
    doc_type: note.doc_type || 'grant_note',
    meta: {
      org_name: note.org_name || '',
      org_city: note.org_city || '',
      meeting: note.meeting || '',
      theme: note.theme || '',
      grant_number: note.grant_number || '',
      grant_amount: note.grant_amount || '',
      grant_duration: note.grant_duration || '',
      status: note.status || 'designing',
      submitted_by: note.submitted_by || '',
    },
    vitals: meta.vitals || {},
    diagrams: Array.isArray(meta.diagrams) ? meta.diagrams : [],
    draft_text: note.draft_text || '',
    sections: (sectionRows as any[]).map(s => ({
      section_key: s.section_key,
      section_num: s.section_num || '',
      title: s.title,
      content_html: s.content_html || '',
      prompt_text: s.prompt_text || '',
      blocks: Array.isArray(s.blocks) ? s.blocks : [],
      sort_order: s.sort_order,
    })),
  };
}

// ── Diff ─────────────────────────────────────────────────────────────────────

export function computeDiff(
  before: DocumentState,
  after: DocumentState,
  remap: Record<string, string | null>,
): Diff {
  const beforeKeys = new Set(before.sections.map(s => s.section_key));
  const afterKeys = new Set(after.sections.map(s => s.section_key));

  const remapped: Array<[string, string]> = [];
  for (const [oldKey, newKey] of Object.entries(remap)) {
    if (newKey && newKey !== oldKey) remapped.push([oldKey, newKey]);
  }
  const renamedFrom = new Set(remapped.map(([from]) => from));
  const renamedTo = new Set(remapped.map(([, to]) => to));

  const added = [...afterKeys].filter(k => !beforeKeys.has(k) && !renamedTo.has(k));
  const removed = [...beforeKeys].filter(k => !afterKeys.has(k) && !renamedFrom.has(k));

  const beforeByKey = new Map(before.sections.map(s => [s.section_key, s]));
  const modified: string[] = [];
  for (const s of after.sections) {
    if (added.includes(s.section_key)) continue;
    const priorKey = Object.entries(remap).find(([, to]) => to === s.section_key)?.[0] ?? s.section_key;
    const prior = beforeByKey.get(priorKey);
    if (!prior) continue;
    if (
      prior.content_html !== s.content_html ||
      prior.title !== s.title ||
      prior.prompt_text !== s.prompt_text ||
      prior.sort_order !== s.sort_order ||
      JSON.stringify(prior.blocks) !== JSON.stringify(s.blocks)
    ) {
      modified.push(s.section_key);
    }
  }

  return { added, modified, removed, remapped };
}

// ── Persist ──────────────────────────────────────────────────────────────────

/**
 * Apply a key_remap to comments/acks/votes:
 *  - "old" → "new" (string): cascade FK rows to the new key.
 *  - "old" → null: mark comments as archived; orphan acks/votes are deleted.
 */
async function applyKeyRemap(noteId: string, remap: Record<string, string | null>): Promise<void> {
  for (const [oldKey, newKey] of Object.entries(remap)) {
    if (newKey === null) {
      await sql`
        UPDATE grant_note_section_comments
        SET deleted_at = now()
        WHERE note_id = ${noteId}::uuid AND section_key = ${oldKey} AND deleted_at IS NULL
      `.catch(() => {});
      await sql`
        DELETE FROM grant_note_section_acks
        WHERE note_id = ${noteId}::uuid AND section_key = ${oldKey}
      `.catch(() => {});
      // Section votes are keyed on block_id (globally unique within a note),
      // so deleting a section also implicitly orphans its votes — clean them.
      // Phase 3 leaves them; phase 4 can prune by walking block ids.
    } else if (newKey !== oldKey) {
      await sql`
        UPDATE grant_note_section_comments
        SET section_key = ${newKey}
        WHERE note_id = ${noteId}::uuid AND section_key = ${oldKey}
      `.catch(() => {});
      await sql`
        UPDATE grant_note_section_acks
        SET section_key = ${newKey}
        WHERE note_id = ${noteId}::uuid AND section_key = ${oldKey}
      `.catch(() => {});
    }
  }
}

/**
 * Persist a new DocumentState atomically (best-effort sequential ops on Neon
 * serverless — no multi-statement transaction). Returns when sections,
 * metadata, and remap cascades have all been applied.
 */
export async function persistDocumentState(
  noteId: string,
  state: DocumentState,
  remap: Record<string, string | null>,
): Promise<void> {
  await applyKeyRemap(noteId, remap);

  // Replace sections wholesale — DocumentState is the source of truth.
  await sql`DELETE FROM grant_note_sections WHERE note_id = ${noteId}::uuid`;

  for (let i = 0; i < state.sections.length; i++) {
    const s = state.sections[i];
    await sql`
      INSERT INTO grant_note_sections
        (note_id, section_key, section_num, title, content_html, prompt_text, blocks, sort_order)
      VALUES
        (${noteId}::uuid, ${s.section_key}, ${s.section_num || ''}, ${s.title},
         ${s.content_html || ''}, ${s.prompt_text || ''},
         ${JSON.stringify(s.blocks)}::jsonb, ${i})
    `;
  }

  // Vitals + diagrams.
  await sql`
    INSERT INTO grant_note_metadata (note_id, vitals, diagrams)
    VALUES (${noteId}::uuid, ${JSON.stringify(state.vitals)}::jsonb, ${JSON.stringify(state.diagrams)}::jsonb)
    ON CONFLICT (note_id) DO UPDATE
      SET vitals = ${JSON.stringify(state.vitals)}::jsonb,
          diagrams = ${JSON.stringify(state.diagrams)}::jsonb
  `;

  // Touch the parent note row.
  await sql`UPDATE grant_notes SET updated_at = now() WHERE id = ${noteId}::uuid`;
}

// ── Compact serialisation for Claude messages ────────────────────────────────

/**
 * A compact, model-friendly rendering of DocumentState for the Claude
 * conversation. We strip HTML to plain text in the listing so the model
 * sees what's there without burning tokens on tag noise.
 */
export function renderDocumentStateForModel(
  state: DocumentState,
  options: { focusKeys?: string[] } = {},
): string {
  const focusSet = options.focusKeys && options.focusKeys.length > 0
    ? new Set(options.focusKeys)
    : null;

  const lines: string[] = [];
  lines.push(`Document: ${state.meta.org_name}${state.meta.org_city ? ', ' + state.meta.org_city : ''} — ${state.doc_type}`);
  if (state.meta.meeting) lines.push(`Meeting: ${state.meta.meeting}`);
  if (state.meta.theme) lines.push(`Theme: ${state.meta.theme}`);

  const vitalsEntries = Object.entries(state.vitals).filter(([, v]) => v != null && v !== '');
  if (vitalsEntries.length > 0) {
    lines.push('');
    lines.push('VITALS:');
    for (const [k, v] of vitalsEntries) lines.push(`  ${k}: ${JSON.stringify(v)}`);
  }

  if (state.draft_text && state.sections.length === 0) {
    lines.push('');
    lines.push('DRAFT TEXT (provided by user — use this as the raw material when seeding the document):');
    lines.push(state.draft_text);
  }

  lines.push('');
  if (focusSet) {
    lines.push(`SECTIONS (${state.sections.length}) — focused on [${[...focusSet].join(', ')}], other sections shown as outline only for context:`);
  } else {
    lines.push(`SECTIONS (${state.sections.length}):`);
  }

  for (const s of state.sections) {
    const isFocus = !focusSet || focusSet.has(s.section_key);
    lines.push('');
    lines.push(`[${s.section_key}] ${s.section_num ? s.section_num + '. ' : ''}${s.title}`);
    if (isFocus) {
      if (s.prompt_text) lines.push(`  reader_prompt: ${s.prompt_text}`);
      if (s.content_html) {
        lines.push('  content_html:');
        lines.push(indent(s.content_html, 4));
      }
      if (s.blocks && s.blocks.length > 0) {
        lines.push(`  blocks: ${s.blocks.map(b => `${b.type}#${b.id}`).join(', ')}`);
      }
    } else {
      // Outline-only — saves tokens significantly when editing one section in
      // a multi-section doc; the model gets enough context to know what other
      // sections cover without their full HTML.
      const wordCount = (s.content_html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      lines.push(`  (outline only — ${wordCount} words, not editable this turn)`);
    }
  }

  return lines.join('\n');
}

function indent(text: string, n: number): string {
  const pad = ' '.repeat(n);
  return text.split('\n').map(l => pad + l).join('\n');
}
