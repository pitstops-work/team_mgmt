import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT c.id, c.body, c.created_at, c.deleted_at, c.reviewer_id, r.name as reviewer_name
    FROM grant_note_comments c
    JOIN reviewers r ON r.id = c.reviewer_id
    WHERE c.note_id = ${id}::uuid
    ORDER BY c.created_at ASC
  `;
  return ok({ comments: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { reviewer_id, text } = body;
  if (!reviewer_id) return bad('reviewer_id required');
  if (!text?.trim()) return bad('text required');
  if (text.length > 5000) return bad('too long');

  const rev = await sql`SELECT id FROM reviewers WHERE id = ${reviewer_id}::uuid`;
  if (rev.length === 0) return bad('reviewer not found', 401);

  const note = await sql`SELECT id FROM grant_notes WHERE id = ${id}::uuid`;
  if (note.length === 0) return bad('note not found', 404);

  const rows = await sql`
    INSERT INTO grant_note_comments (note_id, reviewer_id, body)
    VALUES (${id}::uuid, ${reviewer_id}::uuid, ${text.trim()})
    RETURNING id, body, created_at
  `;

  await sql`UPDATE reviewers SET last_seen_at = now() WHERE id = ${reviewer_id}::uuid`;

  const enriched = await sql`
    SELECT c.id, c.body, c.created_at, c.deleted_at, c.reviewer_id, r.name as reviewer_name
    FROM grant_note_comments c JOIN reviewers r ON r.id = c.reviewer_id
    WHERE c.id = ${rows[0].id}
  `;
  return ok({ comment: enriched[0] });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const commentId = url.searchParams.get('comment_id');
  const reviewerId = url.searchParams.get('reviewer_id');
  if (!commentId || !reviewerId) return bad('comment_id and reviewer_id required');

  const existing = await sql`
    SELECT id, reviewer_id FROM grant_note_comments
    WHERE id = ${commentId}::uuid AND note_id = ${id}::uuid
  `;
  if (existing.length === 0) return bad('not found', 404);
  if (existing[0].reviewer_id !== reviewerId) return bad('not your comment', 403);

  await sql`UPDATE grant_note_comments SET deleted_at = now() WHERE id = ${commentId}::uuid`;
  return ok({ deleted: true });
}
