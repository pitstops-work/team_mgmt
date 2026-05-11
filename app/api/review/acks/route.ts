import { sql, ok, bad, getReviewerId } from '@/lib/review/db';

export const dynamic = 'force-dynamic';

// GET /api/acks — returns all acks with reviewer names
export async function GET() {
  const rows = await sql`
    SELECT a.section_id, a.reviewer_id, a.created_at, r.name as reviewer_name
    FROM acks a
    JOIN reviewers r ON r.id = a.reviewer_id
    ORDER BY a.created_at ASC
  `;
  return ok({ acks: rows });
}

// POST /api/acks — body: { section_id }
// Toggles ack on/off
export async function POST(req: Request) {
  const reviewerId = getReviewerId(req);
  if (!reviewerId) return bad('reviewer required', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const sectionId = (body?.section_id || '').toString().trim();
  if (!sectionId) return bad('section_id required');

  const rev = await sql`SELECT id FROM reviewers WHERE id = ${reviewerId}::uuid`;
  if (rev.length === 0) return bad('reviewer not found', 401);

  const existing = await sql`
    SELECT id FROM acks
    WHERE section_id = ${sectionId} AND reviewer_id = ${reviewerId}::uuid
  `;
  if (existing.length > 0) {
    await sql`DELETE FROM acks WHERE id = ${existing[0].id}`;
    return ok({ acked: false });
  }
  await sql`
    INSERT INTO acks (section_id, reviewer_id) VALUES (${sectionId}, ${reviewerId}::uuid)
  `;
  return ok({ acked: true });
}
