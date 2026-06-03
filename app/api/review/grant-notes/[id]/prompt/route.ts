// Phase 4: per-section AI edit now routes through the orchestrator.
//
// Backwards compat: the design page's client expects { content_html }, so we
// fetch the post-orchestrate section content and return it under that key.
// New callers should prefer POSTing directly to /orchestrate.

import { sql, ok, bad } from '@/lib/review/db';
import { runOrchestrator } from '@/lib/review/orchestrator/runtime';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const instruction: string = String(body?.instruction || '').trim();
  const sectionKey: string = String(body?.section_key || '');
  const currentHtml: string = String(body?.current_html || '');
  const includeContext: boolean = !!body?.include_context;

  if (!instruction) return bad('instruction required');
  if (!sectionKey) return bad('section_key required');
  if (!currentHtml) return bad('current_html required');

  // If the design page passed local-only edits via current_html, persist them
  // before invoking the orchestrator so the model sees the same content.
  await sql`
    UPDATE grant_note_sections
    SET content_html = ${currentHtml}, updated_at = now()
    WHERE note_id = ${id}::uuid AND section_key = ${sectionKey}
  `.catch(() => {});

  const result = await runOrchestrator({
    noteId: id,
    instruction,
    scopeOverride: ['language', 'format'],
    sectionFilter: includeContext ? undefined : [sectionKey],
    parentVersionId: null,
    createdBy: 'staff',
  });

  if (result.clarification_request) {
    return ok({
      content_html: null,
      clarification_request: result.clarification_request,
    });
  }

  const rows = await sql`
    SELECT content_html FROM grant_note_sections
    WHERE note_id = ${id}::uuid AND section_key = ${sectionKey}
  `.catch(() => [] as any[]);
  const html = (rows as any[])[0]?.content_html || '';

  return ok({
    content_html: html,
    version_id: result.version_id,
    capability_calls: result.capability_calls,
    diff: result.diff,
  });
}
