import { sql, bad } from '@/lib/review/db';
import { buildGrantNoteDocx, buildFreeflowDocx, buildFromDraftText } from '@/lib/review/docxExport';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [noteRows, sectionRowsRaw, metaRows] = await Promise.all([
    sql`
      SELECT org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration,
             doc_type, draft_text
      FROM grant_notes WHERE id = ${id}::uuid
    `,
    sql`
      SELECT title, content_html, blocks FROM grant_note_sections
      WHERE note_id = ${id}::uuid
      ORDER BY sort_order ASC
    `.catch(() => [] as any[]),
    sql`
      SELECT vitals, diagrams FROM grant_note_metadata
      WHERE note_id = ${id}::uuid
    `.catch(() => [] as any[]),
  ]);

  if (noteRows.length === 0) return bad('not found', 404);

  const note = noteRows[0] as any;
  const sectionRows = sectionRowsRaw as any[];
  const meta = (metaRows as any[])[0];

  // Load doc type config to determine export mode
  const docTypeRows = await sql`SELECT label, export_mode FROM doc_types WHERE key = ${note.doc_type}`.catch(() => [] as any[]);
  const docTypeConfig = (docTypeRows as any[])[0];
  const exportMode: string = docTypeConfig?.export_mode ?? (note.doc_type === 'programme_design' ? 'freeflow' : 'structured');
  const docTypeLabel: string = docTypeConfig?.label ?? (note.doc_type === 'programme_design' ? 'Programme Design' : 'Grant Note');

  const noteData = {
    org_name: note.org_name,
    org_city: note.org_city,
    meeting: note.meeting,
    theme: note.theme,
    grant_number: note.grant_number,
    grant_amount: note.grant_amount,
    grant_duration: note.grant_duration,
    doc_type: note.doc_type,
    vitals: meta?.vitals || {},
    diagrams: Array.isArray(meta?.diagrams) ? meta.diagrams : [],
  };

  let buffer: Buffer;
  if (sectionRows.length > 0) {
    buffer = exportMode === 'freeflow'
      ? await buildFreeflowDocx(noteData, sectionRows)
      : await buildGrantNoteDocx(noteData, sectionRows);
  } else {
    buffer = await buildFromDraftText(note.draft_text as string, noteData);
  }

  const slugLabel = docTypeLabel.toLowerCase().replace(/\s+/g, '-');
  const slugOrg = (note.org_name as string).replace(/\s+/g, '-').toLowerCase();
  const filename = `${slugLabel}-${slugOrg}.docx`;

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
