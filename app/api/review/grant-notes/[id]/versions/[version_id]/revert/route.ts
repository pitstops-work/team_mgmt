// Revert to a prior version. Implemented as a new version row whose snapshot
// is a copy of the older one — never destructive. After insert, rebuilds the
// section read-model + comments cascade.

import { sql, ok, bad } from '@/lib/review/db';
import { persistDocumentState, DocumentState } from '@/lib/review/orchestrator/state';
import { snapshotVersion } from '@/lib/review/versions';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; version_id: string }> },
) {
  const { id, version_id } = await params;

  let body: any = {};
  try { body = await req.json(); } catch { /* optional */ }
  const createdBy: string = typeof body?.created_by === 'string' ? body.created_by : 'staff';

  const rows = await sql`
    SELECT snapshot_json, version_number
    FROM grant_note_versions
    WHERE id = ${version_id}::uuid AND note_id = ${id}::uuid
  `.catch(() => [] as any[]);
  const row = (rows as any[])[0];
  if (!row) return bad('version not found', 404);

  const snapshot = row.snapshot_json as any;
  if (!snapshot || !Array.isArray(snapshot.sections)) {
    return bad('version snapshot is malformed', 500);
  }

  // Rebuild DocumentState from the older snapshot. We need the current note_id
  // (unchanged), the snapshot meta, and the sections.
  const restored: DocumentState = {
    note_id: id,
    doc_type: snapshot.doc_type || 'grant_note',
    meta: snapshot.meta || {
      org_name: '', org_city: '', meeting: '', theme: '',
      grant_number: '', grant_amount: '', grant_duration: '',
      status: 'designing', submitted_by: '',
    },
    vitals: snapshot.vitals || {},
    diagrams: Array.isArray(snapshot.diagrams) ? snapshot.diagrams : [],
    draft_text: snapshot.draft_text || '',
    sections: (snapshot.sections as any[]).map((s, i) => ({
      section_key: String(s.section_key),
      section_num: String(s.section_num || ''),
      title: String(s.title || 'Untitled'),
      content_html: String(s.content_html || ''),
      prompt_text: String(s.prompt_text || ''),
      blocks: Array.isArray(s.blocks) ? s.blocks : [],
      sort_order: i,
    })),
  };

  // No key_remap on revert — we're just restoring an older shape.
  await persistDocumentState(id, restored, {});

  const newVersionId = await snapshotVersion({
    noteId: id,
    trigger: 'orchestrator_turn',
    createdBy,
    instruction: `Reverted to v${row.version_number}`,
    scopeUsed: [],
    capabilityCalls: [{
      tool: 'revert',
      args: { source_version_number: row.version_number, source_version_id: version_id },
      summary: `Restored snapshot from v${row.version_number}.`,
    }],
    keyRemap: {},
  });

  let newVersionNumber: number | null = null;
  if (newVersionId) {
    const v = await sql`SELECT version_number FROM grant_note_versions WHERE id = ${newVersionId}::uuid`.catch(() => [] as any[]);
    newVersionNumber = (v as any[])[0]?.version_number ?? null;
  }

  return ok({
    ok: true,
    new_version_id: newVersionId,
    new_version_number: newVersionNumber,
    reverted_to_version_number: row.version_number,
  });
}
