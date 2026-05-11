import { bad } from '@/lib/review/db';
import { buildFromDraftText, buildGrantNoteDocx } from '@/lib/review/docxExport';

export const runtime = 'nodejs';

// POST — export Word from draft text (before note is saved to DB)
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { text, org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration, doc_type } = body;
  if (!text?.trim()) return bad('text required');
  if (!org_name?.trim()) return bad('org_name required');

  const noteData = { org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration, doc_type: doc_type || 'grant_note' };

  const buffer = await buildFromDraftText(text, noteData);

  const filename = `${doc_type === 'programme_design' ? 'programme-design' : 'grant-note'}-${org_name.replace(/\s+/g, '-').toLowerCase()}.docx`;

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
