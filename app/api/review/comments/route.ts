import { sql, ok, bad, getReviewerId } from '@/lib/review/db';

export const dynamic = 'force-dynamic';

// GET /api/comments?section=s1
// Returns all comments for a section (or all sections if no param) with author names
// and edit history flag, threaded structure preserved.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const section = url.searchParams.get('section');

  const rows = section
    ? await sql`
        SELECT c.id, c.section_id, c.parent_id, c.body, c.created_at, c.updated_at, c.deleted_at,
               c.reviewer_id, r.name as reviewer_name,
               (SELECT COUNT(*)::int FROM comment_edits WHERE comment_id = c.id) as edit_count
        FROM comments c
        JOIN reviewers r ON r.id = c.reviewer_id
        WHERE c.section_id = ${section}
        ORDER BY c.created_at ASC
      `
    : await sql`
        SELECT c.id, c.section_id, c.parent_id, c.body, c.created_at, c.updated_at, c.deleted_at,
               c.reviewer_id, r.name as reviewer_name,
               (SELECT COUNT(*)::int FROM comment_edits WHERE comment_id = c.id) as edit_count
        FROM comments c
        JOIN reviewers r ON r.id = c.reviewer_id
        ORDER BY c.section_id, c.created_at ASC
      `;

  return ok({ comments: rows });
}

// POST /api/comments — body: { section_id, body, parent_id? }
// X-Reviewer-Id header required.
export async function POST(req: Request) {
  const reviewerId = getReviewerId(req);
  if (!reviewerId) return bad('reviewer required', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const sectionId = (body?.section_id || '').toString().trim();
  const text = (body?.body || '').toString().trim();
  const parentId = body?.parent_id ? body.parent_id.toString() : null;

  if (!sectionId) return bad('section_id required');
  if (!text) return bad('body required');
  if (text.length > 5000) return bad('body too long (max 5000)');

  // Validate reviewer exists (UUID could be stale)
  const rev = await sql`SELECT id FROM reviewers WHERE id = ${reviewerId}::uuid`;
  if (rev.length === 0) return bad('reviewer not found', 401);

  // If parent specified, verify it exists in same section
  if (parentId) {
    const parent = await sql`
      SELECT id, section_id FROM comments WHERE id = ${parentId}::uuid
    `;
    if (parent.length === 0) return bad('parent comment not found');
    if (parent[0].section_id !== sectionId) return bad('parent comment is in a different section');
  }

  const created = await sql`
    INSERT INTO comments (section_id, reviewer_id, parent_id, body)
    VALUES (${sectionId}, ${reviewerId}::uuid, ${parentId ? `${parentId}` : null}::uuid, ${text})
    RETURNING id, section_id, reviewer_id, parent_id, body, created_at, updated_at
  `;

  // Touch reviewer
  await sql`UPDATE reviewers SET last_seen_at = now() WHERE id = ${reviewerId}::uuid`;

  // Return enriched
  const enriched = await sql`
    SELECT c.id, c.section_id, c.parent_id, c.body, c.created_at, c.updated_at, c.deleted_at,
           c.reviewer_id, r.name as reviewer_name, 0 as edit_count
    FROM comments c
    JOIN reviewers r ON r.id = c.reviewer_id
    WHERE c.id = ${created[0].id}
  `;

  return ok({ comment: enriched[0] });
}

// PATCH /api/comments — body: { id, body }
// Edit own comment. Saves previous body to comment_edits for history.
export async function PATCH(req: Request) {
  const reviewerId = getReviewerId(req);
  if (!reviewerId) return bad('reviewer required', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const id = (body?.id || '').toString();
  const newBody = (body?.body || '').toString().trim();
  if (!id) return bad('id required');
  if (!newBody) return bad('body required');
  if (newBody.length > 5000) return bad('body too long (max 5000)');

  // Verify ownership
  const existing = await sql`
    SELECT id, body, reviewer_id, deleted_at FROM comments WHERE id = ${id}::uuid
  `;
  if (existing.length === 0) return bad('not found', 404);
  if (existing[0].deleted_at) return bad('comment is deleted', 410);
  if (existing[0].reviewer_id !== reviewerId) return bad('not your comment', 403);

  // No-op if unchanged
  if (existing[0].body === newBody) {
    return ok({ comment: existing[0], unchanged: true });
  }

  // Save previous to history then update
  await sql`
    INSERT INTO comment_edits (comment_id, previous_body, edited_by)
    VALUES (${id}::uuid, ${existing[0].body}, ${reviewerId}::uuid)
  `;
  const updated = await sql`
    UPDATE comments SET body = ${newBody}, updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING id, section_id, parent_id, body, created_at, updated_at
  `;

  // Return enriched
  const enriched = await sql`
    SELECT c.id, c.section_id, c.parent_id, c.body, c.created_at, c.updated_at, c.deleted_at,
           c.reviewer_id, r.name as reviewer_name,
           (SELECT COUNT(*)::int FROM comment_edits WHERE comment_id = c.id) as edit_count
    FROM comments c
    JOIN reviewers r ON r.id = c.reviewer_id
    WHERE c.id = ${id}::uuid
  `;

  return ok({ comment: enriched[0] });
}

// DELETE /api/comments?id=xxx
// Soft-delete (sets deleted_at). Only own comments.
export async function DELETE(req: Request) {
  const reviewerId = getReviewerId(req);
  if (!reviewerId) return bad('reviewer required', 401);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return bad('id required');

  const existing = await sql`
    SELECT id, reviewer_id FROM comments WHERE id = ${id}::uuid
  `;
  if (existing.length === 0) return bad('not found', 404);
  if (existing[0].reviewer_id !== reviewerId) return bad('not your comment', 403);

  await sql`
    UPDATE comments SET deleted_at = now() WHERE id = ${id}::uuid
  `;
  return ok({ deleted: true, id });
}
