import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT v.block_id, v.reviewer_id, v.vote_position AS position, r.name as reviewer_name
    FROM grant_note_section_votes v
    JOIN reviewers r ON r.id = v.reviewer_id
    WHERE v.note_id = ${id}::uuid
  `;
  return ok({ votes: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { reviewer_id, block_id, position } = body;
  if (!reviewer_id || !block_id || !position) return bad('reviewer_id, block_id, and position required');
  if (!['agree', 'discuss', 'disagree'].includes(position)) return bad('invalid position');

  const existing = await sql`
    SELECT vote_position FROM grant_note_section_votes
    WHERE note_id = ${id}::uuid AND block_id = ${block_id} AND reviewer_id = ${reviewer_id}::uuid
  `;

  if (existing.length > 0 && existing[0].vote_position === position) {
    await sql`
      DELETE FROM grant_note_section_votes
      WHERE note_id = ${id}::uuid AND block_id = ${block_id} AND reviewer_id = ${reviewer_id}::uuid
    `;
    return ok({ removed: true });
  }

  await sql`
    INSERT INTO grant_note_section_votes (note_id, block_id, reviewer_id, vote_position)
    VALUES (${id}::uuid, ${block_id}, ${reviewer_id}::uuid, ${position})
    ON CONFLICT (note_id, block_id, reviewer_id) DO UPDATE SET vote_position = ${position}, created_at = now()
  `;
  return ok({ position });
}
