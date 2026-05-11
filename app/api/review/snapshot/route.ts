import { sql, ok } from '@/lib/review/db';

export const dynamic = 'force-dynamic';

// GET /api/snapshot — returns a single payload of everything the page renders.
// The client polls this every ~1.5s. Each row carries updated_at, so the client
// can detect changes by comparing a hash/signature.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get('since'); // ISO timestamp; if provided, returns only updated_at > since

  // Fetch in parallel
  const [comments, notes, votes, acks, reviewers, ts] = await Promise.all([
    since
      ? sql`
          SELECT c.id, c.section_id, c.parent_id, c.body, c.created_at, c.updated_at, c.deleted_at,
                 c.reviewer_id, r.name as reviewer_name,
                 (SELECT COUNT(*)::int FROM comment_edits WHERE comment_id = c.id) as edit_count
          FROM comments c
          JOIN reviewers r ON r.id = c.reviewer_id
          WHERE c.updated_at > ${since}::timestamptz OR c.deleted_at > ${since}::timestamptz
          ORDER BY c.updated_at ASC
        `
      : sql`
          SELECT c.id, c.section_id, c.parent_id, c.body, c.created_at, c.updated_at, c.deleted_at,
                 c.reviewer_id, r.name as reviewer_name,
                 (SELECT COUNT(*)::int FROM comment_edits WHERE comment_id = c.id) as edit_count
          FROM comments c
          JOIN reviewers r ON r.id = c.reviewer_id
          ORDER BY c.created_at ASC
        `,

    sql`
      SELECT n.id, n.section_id, n.body, n.created_at, n.updated_at,
             n.reviewer_id, r.name as reviewer_name
      FROM notes n
      JOIN reviewers r ON r.id = n.reviewer_id
      ORDER BY n.section_id, n.updated_at DESC
    `,

    sql`
      SELECT v.id, v.decision_num, v.position, v.created_at, v.updated_at,
             v.reviewer_id, r.name as reviewer_name
      FROM votes v
      JOIN reviewers r ON r.id = v.reviewer_id
      ORDER BY v.decision_num ASC
    `,

    sql`
      SELECT a.section_id, a.reviewer_id, a.created_at, r.name as reviewer_name
      FROM acks a
      JOIN reviewers r ON r.id = a.reviewer_id
    `,

    sql`SELECT id, name FROM reviewers ORDER BY name`,

    sql`SELECT now() as server_time`,
  ]);

  // Tallies for votes
  const tallies: Record<number, Record<string, number>> = {};
  for (const v of votes as any[]) {
    if (!tallies[v.decision_num]) tallies[v.decision_num] = { agree: 0, discuss: 0, disagree: 0 };
    tallies[v.decision_num][v.position] = (tallies[v.decision_num][v.position] || 0) + 1;
  }

  return ok({
    server_time: (ts as any[])[0].server_time,
    is_partial: !!since,
    comments,
    notes,
    votes,
    tallies,
    acks,
    reviewers,
  });
}
