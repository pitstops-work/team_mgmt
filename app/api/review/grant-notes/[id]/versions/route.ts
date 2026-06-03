import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200);

  const rows = await sql`
    SELECT id, version_number, parent_version_id, instruction, scope_used,
           capability_calls, key_remap, trigger, created_by, created_at
    FROM grant_note_versions
    WHERE note_id = ${id}::uuid
    ORDER BY version_number DESC
    LIMIT ${limit}
  `.catch(() => [] as any[]);

  return ok({
    versions: (rows as any[]).map(r => ({
      id: r.id,
      version_number: r.version_number,
      parent_version_id: r.parent_version_id,
      instruction: r.instruction,
      scope_used: r.scope_used || [],
      capability_calls: r.capability_calls || [],
      key_remap: r.key_remap || {},
      trigger: r.trigger,
      created_by: r.created_by,
      created_at: r.created_at,
    })),
  });
}
