import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!orgId) return bad('orgId required');

  const rows = await sql`DELETE FROM orgs WHERE id = ${orgId} RETURNING id`;
  if (rows.length === 0) return bad('not found', 404);
  return ok({ deleted: orgId });
}
