import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT a.section_key, a.reviewer_id, a.created_at, r.name as reviewer_name
    FROM grant_note_section_acks a
    JOIN reviewers r ON r.id = a.reviewer_id
    WHERE a.note_id = ${id}::uuid
  `;
  return ok({ acks: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { reviewer_id, section_key } = body;
  if (!reviewer_id || !section_key) return bad('reviewer_id and section_key required');

  const existing = await sql`
    SELECT 1 FROM grant_note_section_acks
    WHERE note_id = ${id}::uuid AND section_key = ${section_key} AND reviewer_id = ${reviewer_id}::uuid
  `;

  if (existing.length > 0) {
    await sql`
      DELETE FROM grant_note_section_acks
      WHERE note_id = ${id}::uuid AND section_key = ${section_key} AND reviewer_id = ${reviewer_id}::uuid
    `;
    return ok({ acked: false });
  }

  await sql`
    INSERT INTO grant_note_section_acks (note_id, section_key, reviewer_id)
    VALUES (${id}::uuid, ${section_key}, ${reviewer_id}::uuid)
  `;
  return ok({ acked: true });
}
