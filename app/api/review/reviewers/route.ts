// NOTE: The reviewers table needs: ALTER TABLE reviewers ADD COLUMN IF NOT EXISTS user_id TEXT UNIQUE;
// Run this once against REVIEW_DATABASE_URL before deploying.

import { sql, ok, bad } from '@/lib/review/db';

export const dynamic = 'force-dynamic';

// POST /api/review/reviewers — body: { name, user_id? }
// If user_id is provided, upserts by user_id (pitstops NextAuth user id).
// Falls back to case-insensitive name match for legacy entries.
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const name = (body?.name || '').toString().trim();
  if (!name) return bad('name is required');
  if (name.length > 80) return bad('name too long (max 80)');
  const userId: string | null = body?.user_id ? String(body.user_id) : null;

  if (userId) {
    const existing = await sql`
      SELECT id, name FROM reviewers WHERE user_id = ${userId} LIMIT 1
    `;
    if (existing.length > 0) {
      await sql`UPDATE reviewers SET last_seen_at = now(), name = ${name} WHERE id = ${existing[0].id}`;
      return ok({ id: existing[0].id, name, existing: true });
    }
    const created = await sql`
      INSERT INTO reviewers (name, user_id) VALUES (${name}, ${userId}) RETURNING id, name
    `;
    return ok({ id: created[0].id, name: created[0].name, existing: false });
  }

  // Legacy: name-based lookup
  const existing = await sql`
    SELECT id, name FROM reviewers WHERE LOWER(name) = LOWER(${name}) LIMIT 1
  `;
  if (existing.length > 0) {
    await sql`UPDATE reviewers SET last_seen_at = now() WHERE id = ${existing[0].id}`;
    return ok({ id: existing[0].id, name: existing[0].name, existing: true });
  }
  const created = await sql`
    INSERT INTO reviewers (name) VALUES (${name}) RETURNING id, name
  `;
  return ok({ id: created[0].id, name: created[0].name, existing: false });
}

export async function GET() {
  const rows = await sql`
    SELECT id, name, created_at, last_seen_at FROM reviewers ORDER BY created_at ASC
  `;
  return ok({ reviewers: rows });
}
