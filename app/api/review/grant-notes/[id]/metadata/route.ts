import { sql, ok, bad } from '@/lib/review/db';
import { auth } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/roleGuard';
import { snapshotVersion } from '@/lib/review/versions';

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
  const session = await auth();
  if (!isSuperAdmin(session)) return bad('Forbidden', 403);

  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { source_documents, staff_notes, vitals } = body;

  let newDocUrls: string[] = [];
  if (Array.isArray(source_documents)) {
    const prior = await sql`
      SELECT source_documents FROM grant_note_metadata WHERE note_id = ${id}::uuid
    `.catch(() => [] as any[]);
    const priorUrls: string[] = Array.isArray((prior as any[])[0]?.source_documents)
      ? (prior as any[])[0].source_documents
      : [];
    const priorSet = new Set(priorUrls);
    newDocUrls = source_documents.filter((u: string) => typeof u === 'string' && !priorSet.has(u));
  }

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

  // Vitals are part of DocumentState — snapshot when they change.
  // Source-doc and staff-notes edits don't move the document itself yet
  // (they're consumed at draft/transform time).
  if (vitals !== undefined) {
    await snapshotVersion({ noteId: id, trigger: 'metadata_vitals' });
  }

  return ok({ ok: true, new_doc_urls: newDocUrls });
}
