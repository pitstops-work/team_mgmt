import { sql, ok, bad } from '@/lib/review/db';
import { snapshotVersion } from '@/lib/review/versions';

export const runtime = 'nodejs';

async function ensureMetadataTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS grant_note_metadata (
      note_id uuid PRIMARY KEY,
      vitals jsonb DEFAULT '{}',
      diagrams jsonb DEFAULT '[]',
      source_documents jsonb DEFAULT '[]',
      staff_notes text DEFAULT ''
    )
  `;
}

export async function GET() {
  const rows = await sql`
    SELECT id, org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration,
           doc_type, status, submitted_by, created_at
    FROM grant_notes
    ORDER BY created_at DESC
  `;
  return ok({ notes: rows });
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const {
    org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration,
    doc_type, draft_text, submitted_by, status,
    source_documents, staff_notes,
  } = body;

  if (!org_name?.trim()) return bad('org_name required');

  // draft_text is required for draft path; design path sends source_documents instead
  const hasSourceDocs = Array.isArray(source_documents) && source_documents.length > 0;
  if (!hasSourceDocs && !draft_text?.trim()) return bad('draft_text or source_documents required');

  const validStatuses = ['designing', 'submitted', 'approved', 'rejected'];
  const insertStatus = validStatuses.includes(status) ? status : 'designing';

  const rows = await sql`
    INSERT INTO grant_notes
      (org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration,
       doc_type, draft_text, submitted_by, status)
    VALUES
      (${org_name}, ${org_city || ''}, ${meeting || ''}, ${theme || ''},
       ${grant_number || ''}, ${grant_amount || ''}, ${grant_duration || ''},
       ${doc_type || 'grant_note'}, ${draft_text || ''}, ${submitted_by || ''}, ${insertStatus})
    RETURNING id
  `;

  const noteId = rows[0].id;

  if (hasSourceDocs) {
    await ensureMetadataTable();
    await sql`
      INSERT INTO grant_note_metadata (note_id, source_documents, staff_notes)
      VALUES (${noteId}::uuid, ${JSON.stringify(source_documents)}::jsonb, ${staff_notes || ''})
      ON CONFLICT (note_id) DO UPDATE
        SET source_documents = ${JSON.stringify(source_documents)}::jsonb,
            staff_notes = ${staff_notes || ''}
    `;
  }

  await snapshotVersion({
    noteId,
    trigger: 'note_created',
    createdBy: submitted_by || 'system',
  });

  return ok({
    id: noteId,
    ingest_doc_urls: hasSourceDocs ? source_documents : [],
  });
}
