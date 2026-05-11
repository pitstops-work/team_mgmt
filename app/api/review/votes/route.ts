import { sql, ok, bad, getReviewerId } from '@/lib/review/db';

export const dynamic = 'force-dynamic';

// GET /api/votes — returns all votes with reviewer names + per-decision tallies
export async function GET() {
  const rows = await sql`
    SELECT v.id, v.decision_num, v.position, v.created_at, v.updated_at,
           v.reviewer_id, r.name as reviewer_name
    FROM votes v
    JOIN reviewers r ON r.id = v.reviewer_id
    ORDER BY v.decision_num ASC, v.created_at ASC
  `;

  // Compute tallies
  const tallyRows = await sql`
    SELECT decision_num, position, COUNT(*)::int as count
    FROM votes
    GROUP BY decision_num, position
  `;
  const tallies: Record<number, Record<string, number>> = {};
  for (const t of tallyRows as any[]) {
    if (!tallies[t.decision_num]) tallies[t.decision_num] = { agree: 0, discuss: 0, disagree: 0 };
    tallies[t.decision_num][t.position] = t.count;
  }

  return ok({ votes: rows, tallies });
}

// POST /api/votes — body: { decision_num, position }
// Upsert per (decision_num, reviewer_id). Posting same position toggles off.
export async function POST(req: Request) {
  const reviewerId = getReviewerId(req);
  if (!reviewerId) return bad('reviewer required', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const decisionNum = parseInt(body?.decision_num);
  const position = (body?.position || '').toString();
  if (!decisionNum || decisionNum < 1) return bad('decision_num required');
  if (!['agree', 'discuss', 'disagree'].includes(position)) return bad('invalid position');

  const rev = await sql`SELECT id FROM reviewers WHERE id = ${reviewerId}::uuid`;
  if (rev.length === 0) return bad('reviewer not found', 401);

  // If already voted same way, remove (toggle)
  const existing = await sql`
    SELECT id, position FROM votes
    WHERE decision_num = ${decisionNum} AND reviewer_id = ${reviewerId}::uuid
  `;
  if (existing.length > 0 && existing[0].position === position) {
    await sql`DELETE FROM votes WHERE id = ${existing[0].id}`;
    return ok({ removed: true, decision_num: decisionNum });
  }

  const upserted = await sql`
    INSERT INTO votes (decision_num, reviewer_id, position)
    VALUES (${decisionNum}, ${reviewerId}::uuid, ${position})
    ON CONFLICT (decision_num, reviewer_id)
    DO UPDATE SET position = EXCLUDED.position, updated_at = now()
    RETURNING id, decision_num, position, created_at, updated_at
  `;

  return ok({ vote: upserted[0] });
}
