// Phase 1: shadow-write of grant_note_versions on every mutation.
//
// Builds a DocumentState snapshot from current DB rows (grant_notes +
// grant_note_sections + grant_note_metadata) and inserts a version row.
// Nothing reads these yet — they're an audit trail for now, and the read
// model for the orchestrator in phase 3.

import { sql } from './db';

export type Trigger =
  | 'note_created'
  | 'transform_visual'
  | 'transform_refresh'
  | 'transform_text'
  | 'section_create'
  | 'section_update'
  | 'section_reorder'
  | 'note_patch'
  | 'metadata_vitals'
  | 'orchestrator_turn';

export type SnapshotInput = {
  noteId: string;
  trigger: Trigger;
  createdBy?: string;
  instruction?: string;
  scopeUsed?: string[];
  capabilityCalls?: unknown[];
  keyRemap?: Record<string, string | null>;
};

type SnapshotJson = {
  doc_type: string;
  meta: Record<string, unknown>;
  vitals: Record<string, unknown>;
  diagrams: unknown[];
  draft_text: string;
  sections: Array<{
    section_key: string;
    section_num: string;
    title: string;
    content_html: string;
    prompt_text: string;
    blocks: unknown[];
    sort_order: number;
  }>;
};

async function buildSnapshot(noteId: string): Promise<SnapshotJson | null> {
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
    doc_type: note.doc_type || 'grant_note',
    meta: {
      org_name: note.org_name,
      org_city: note.org_city,
      meeting: note.meeting,
      theme: note.theme,
      grant_number: note.grant_number,
      grant_amount: note.grant_amount,
      grant_duration: note.grant_duration,
      status: note.status,
      submitted_by: note.submitted_by,
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

/**
 * Snapshot the current document state and insert a new version row.
 *
 * Best-effort: never throws into the caller (the underlying mutation already
 * succeeded by the time we're called). Returns null on failure or no-op.
 *
 * Concurrency-safe via UNIQUE(note_id, version_number) — on collision we retry
 * once with the next number.
 */
export async function snapshotVersion(args: SnapshotInput): Promise<string | null> {
  try {
    const snapshot = await buildSnapshot(args.noteId);
    if (!snapshot) return null;

    const scope = args.scopeUsed || [];
    const calls = args.capabilityCalls || [];
    const remap = args.keyRemap || {};
    const createdBy = args.createdBy || 'system';
    const instruction = args.instruction ?? null;
    const trigger = args.trigger;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rows = await sql`
          INSERT INTO grant_note_versions
            (note_id, version_number, parent_version_id, snapshot_json,
             instruction, scope_used, capability_calls, key_remap, trigger, created_by)
          SELECT
            ${args.noteId}::uuid,
            COALESCE(MAX(version_number), 0) + 1,
            (SELECT id FROM grant_note_versions
              WHERE note_id = ${args.noteId}::uuid
              ORDER BY version_number DESC LIMIT 1),
            ${JSON.stringify(snapshot)}::jsonb,
            ${instruction},
            ${scope as any},
            ${JSON.stringify(calls)}::jsonb,
            ${JSON.stringify(remap)}::jsonb,
            ${trigger},
            ${createdBy}
          FROM grant_note_versions
          WHERE note_id = ${args.noteId}::uuid
          RETURNING id
        `;
        if (rows.length > 0) return rows[0].id as string;
        // No prior versions — INSERT used aggregate over zero rows so the SELECT
        // returned no rows. Insert v1 explicitly.
        const v1 = await sql`
          INSERT INTO grant_note_versions
            (note_id, version_number, snapshot_json, instruction, scope_used,
             capability_calls, key_remap, trigger, created_by)
          VALUES
            (${args.noteId}::uuid, 1, ${JSON.stringify(snapshot)}::jsonb,
             ${instruction}, ${scope as any}, ${JSON.stringify(calls)}::jsonb,
             ${JSON.stringify(remap)}::jsonb, ${trigger}, ${createdBy})
          ON CONFLICT (note_id, version_number) DO NOTHING
          RETURNING id
        `;
        if (v1.length > 0) return v1[0].id as string;
        // Lost the v1 race — retry with the aggregate path.
        continue;
      } catch (e: any) {
        if (attempt === 0 && /grant_note_versions.*unique/i.test(String(e?.message))) {
          continue;
        }
        throw e;
      }
    }
    return null;
  } catch (e: any) {
    console.warn('[versions] snapshot failed for', args.noteId, e?.message);
    return null;
  }
}
