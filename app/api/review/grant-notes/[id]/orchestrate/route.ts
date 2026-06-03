import { ok, bad } from '@/lib/review/db';
import { runOrchestrator } from '@/lib/review/orchestrator/runtime';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const instruction: string = String(body?.instruction || '').trim();
  if (!instruction) return bad('instruction required');

  const scopeOverride: string[] | undefined = Array.isArray(body?.scope_override)
    ? body.scope_override.map((x: unknown) => String(x))
    : undefined;
  const sectionFilter: string[] | undefined = Array.isArray(body?.section_filter)
    ? body.section_filter.map((x: unknown) => String(x))
    : undefined;
  const parentVersionId: string | null = typeof body?.parent_version_id === 'string'
    ? body.parent_version_id
    : null;
  const createdBy: string = typeof body?.created_by === 'string' && body.created_by
    ? body.created_by
    : 'system';

  try {
    const result = await runOrchestrator({
      noteId: id,
      instruction,
      scopeOverride,
      sectionFilter,
      parentVersionId,
      createdBy,
    });
    return ok(result);
  } catch (e: any) {
    console.error('[orchestrate]', e?.message, e?.stack);
    return bad(`Orchestrate failed: ${e?.message || 'unknown'}`);
  }
}
