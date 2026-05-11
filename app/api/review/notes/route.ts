import { sql, ok, bad, getReviewerId } from '@/lib/review/db';

export const dynamic = 'force-dynamic';

// GET /api/notes — returns all notes (with author names). Public.
export async function GET() {
  const rows = await sql`
    SELECT n.id, n.section_id, n.body, n.created_at, n.updated_at,
           n.reviewer_id, r.name as reviewer_name
    FROM notes n
    JOIN reviewers r ON r.id = n.reviewer_id
    ORDER BY n.section_id, n.updated_at DESC
  `;
  return ok({ notes: rows });
}

// POST /api/notes — body: { section_id, body }
// Upsert: one note per (section_id, reviewer_id). Posting again replaces.
export async function POST(req: Request) {
  const reviewerId = getReviewerId(req);
  if (!reviewerId) return bad('reviewer required', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const sectionId = (body?.section_id || '').toString().trim();
  const text = (body?.body || '').toString().trim();
  if (!sectionId) return bad('section_id required');
  if (!text) return bad('body required');
  if (text.length > 2000) return bad('body too long (max 2000)');

  const rev = await sql`SELECT id FROM reviewers WHERE id = ${reviewerId}::uuid`;
  if (rev.length === 0) return bad('reviewer not found', 401);

  const upserted = await sql`
    INSERT INTO notes (section_id, reviewer_id, body)
    VALUES (${sectionId}, ${reviewerId}::uuid, ${text})
    ON CONFLICT (section_id, reviewer_id)
    DO UPDATE SET body = EXCLUDED.body, updated_at = now()
    RETURNING id, section_id, reviewer_id, body, created_at, updated_at
  `;

  // Return enriched
  const enriched = await sql`
    SELECT n.id, n.section_id, n.body, n.created_at, n.updated_at,
           n.reviewer_id, r.name as reviewer_name
    FROM notes n
    JOIN reviewers r ON r.id = n.reviewer_id
    WHERE n.id = ${upserted[0].id}
  `;

  return ok({ note: enriched[0] });
}

// DELETE /api/notes?section_id=s1
// Removes the calling reviewer's note for that section.
export async function DELETE(req: Request) {
  const reviewerId = getReviewerId(req);
  if (!reviewerId) return bad('reviewer required', 401);

  const url = new URL(req.url);
  const sectionId = url.searchParams.get('section_id');
  if (!sectionId) return bad('section_id required');

  await sql`
    DELETE FROM notes WHERE section_id = ${sectionId} AND reviewer_id = ${reviewerId}::uuid
  `;
  return ok({ deleted: true });
}
