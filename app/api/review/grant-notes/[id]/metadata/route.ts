import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT source_documents, staff_notes, vitals, diagrams
    FROM grant_note_metadata
    WHERE note_id = ${id}::uuid
  `.catch(() => []);
  const meta = (rows as any[])[0];
  if (!meta) return ok({ source_documents: [], staff_notes: '' });
  return ok({
    source_documents: Array.isArray(meta.source_documents) ? meta.source_documents : [],
    staff_notes: meta.staff_notes || '',
    vitals: meta.vitals || {},
    diagrams: Array.isArray(meta.diagrams) ? meta.diagrams : [],
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { source_documents, staff_notes, vitals } = body;

  const updates: Promise<any>[] = [];

  if (Array.isArray(source_documents)) {
    updates.push(sql`
      INSERT INTO grant_note_metadata (note_id, source_documents)
      VALUES (${id}::uuid, ${JSON.stringify(source_documents)}::jsonb)
      ON CONFLICT (note_id) DO UPDATE
        SET source_documents = ${JSON.stringify(source_documents)}::jsonb
    `);
  }
  if (staff_notes !== undefined) {
    updates.push(sql`
      INSERT INTO grant_note_metadata (note_id, staff_notes)
      VALUES (${id}::uuid, ${staff_notes})
      ON CONFLICT (note_id) DO UPDATE
        SET staff_notes = ${staff_notes}
    `);
  }
  if (vitals !== undefined) {
    updates.push(sql`
      INSERT INTO grant_note_metadata (note_id, vitals)
      VALUES (${id}::uuid, ${JSON.stringify(vitals)}::jsonb)
      ON CONFLICT (note_id) DO UPDATE
        SET vitals = ${JSON.stringify(vitals)}::jsonb
    `);
  }

  await Promise.all(updates);
  return ok({ ok: true });
}
