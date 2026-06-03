// Promotion candidates: cluster instruction_log by normalized pattern, return
// patterns observed >= 3 times that haven't been promoted yet.

import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

const DEFAULT_MIN_COUNT = 3;
const DEFAULT_LIMIT = 25;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const minCount = Math.max(parseInt(url.searchParams.get('min') || String(DEFAULT_MIN_COUNT), 10) || DEFAULT_MIN_COUNT, 2);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), 200);

  const rows = await sql`
    SELECT
      normalized,
      COUNT(*)::int AS count,
      MAX(instruction) AS sample_instruction,
      MAX(created_at) AS last_used,
      ARRAY_AGG(DISTINCT unnest_capability) FILTER (WHERE unnest_capability IS NOT NULL) AS common_scope
    FROM (
      SELECT normalized, instruction, created_at, UNNEST(capabilities_used) AS unnest_capability
      FROM instruction_log
      WHERE was_promoted_to IS NULL
    ) t
    GROUP BY normalized
    HAVING COUNT(*) >= ${minCount}
    ORDER BY COUNT(*) DESC, MAX(created_at) DESC
    LIMIT ${limit}
  `.catch(() => [] as any[]);

  return ok({
    candidates: (rows as any[]).map(r => ({
      normalized: r.normalized,
      count: r.count,
      sample_instruction: r.sample_instruction,
      last_used: r.last_used,
      common_scope: Array.isArray(r.common_scope) ? r.common_scope : [],
    })),
  });
}

// Mark all rows matching a normalized pattern as promoted to a capability.
// The capability creation itself is a separate call (POST /api/review/capabilities).
export async function POST(req: Request) {
  if (req.headers.get('x-admin-passphrase') !== process.env.STAFF_PASSPHRASE) {
    return bad('Unauthorized', 401);
  }
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const normalized: string = String(body?.normalized || '').trim();
  const capabilityId: string = String(body?.capability_id || '').trim();
  if (!normalized || !capabilityId) return bad('normalized + capability_id required');

  const updated = await sql`
    UPDATE instruction_log
    SET was_promoted_to = ${capabilityId}
    WHERE normalized = ${normalized} AND was_promoted_to IS NULL
    RETURNING id
  `.catch(() => [] as any[]);

  return ok({ ok: true, marked: (updated as any[]).length });
}
