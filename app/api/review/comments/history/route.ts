import { sql, ok, bad } from '@/lib/review/db';

export const dynamic = 'force-dynamic';

// GET /api/comments/history?id=xxx → all edit revisions for a comment, oldest first
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return bad('id required');

  const rows = await sql`
    SELECT ce.id, ce.previous_body, ce.edited_at, r.name as edited_by_name
    FROM comment_edits ce
    LEFT JOIN reviewers r ON r.id = ce.edited_by
    WHERE ce.comment_id = ${id}::uuid
    ORDER BY ce.edited_at ASC
  `;

  // Also include current body
  const current = await sql`
    SELECT body, updated_at, c.reviewer_id, r.name as current_author
    FROM comments c
    JOIN reviewers r ON r.id = c.reviewer_id
    WHERE c.id = ${id}::uuid
  `;

  if (current.length === 0) return bad('comment not found', 404);

  return ok({
    history: rows,
    current: current[0],
  });
}
