import { sql, ok, bad } from '@/lib/review/db';
import { auth } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/roleGuard';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT gn.id, gn.org_name, gn.org_city, gn.meeting, gn.theme,
           gn.grant_number, gn.grant_amount, gn.grant_duration,
           gn.doc_type, gn.draft_text, gn.status, gn.submitted_by,
           gn.created_at, gn.updated_at,
           gnm.vitals, gnm.diagrams, gnm.source_documents, gnm.staff_notes
    FROM grant_notes gn
    LEFT JOIN grant_note_metadata gnm ON gnm.note_id = gn.id
    WHERE gn.id = ${id}::uuid
  `;
  if (rows.length === 0) return bad('not found', 404);
  return ok({ note: rows[0] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return bad('Forbidden', 403);

  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { status, draft_text, grant_amount, grant_duration } = body;

  if (status) {
    if (!['designing', 'submitted', 'approved', 'rejected'].includes(status)) return bad('invalid status');
    await sql`
      UPDATE grant_notes SET status = ${status}, updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }

  if (draft_text !== undefined) {
    await sql`
      UPDATE grant_notes SET draft_text = ${draft_text}, updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }

  if (grant_amount !== undefined || grant_duration !== undefined) {
    await sql`
      UPDATE grant_notes SET
        grant_amount = COALESCE(${grant_amount ?? null}, grant_amount),
        grant_duration = COALESCE(${grant_duration ?? null}, grant_duration),
        updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }

  return ok({ ok: true });
}
