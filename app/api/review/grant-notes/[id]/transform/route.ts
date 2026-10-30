// Phase 4: /transform now routes through the orchestrator. The three legacy
// internal paths (visual / refresh / text) become orchestrator turns with
// crafted instructions. Response shape preserved for backwards compat with
// the design page's "Re-transform / Refresh content" button.

import { sql, ok, bad } from '@/lib/review/db';
import { runOrchestrator } from '@/lib/review/orchestrator/runtime';
import {
  structuredDraftInstruction,
  REFRESH_INSTRUCTION,
  SINGLE_SECTION_DRAFT_INSTRUCTION,
} from '@/lib/review/orchestrator/instructions';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [noteRows, metaRows, existingSections, docTypeRows] = await Promise.all([
      sql`SELECT doc_type, draft_text FROM grant_notes WHERE id = ${id}::uuid`,
      sql`SELECT source_documents FROM grant_note_metadata WHERE note_id = ${id}::uuid`.catch(() => [] as any[]),
      sql`SELECT section_key FROM grant_note_sections WHERE note_id = ${id}::uuid LIMIT 1`.catch(() => [] as any[]),
      sql`SELECT key, sections_mode FROM doc_types`.catch(() => [] as any[]),
    ]);

    if (noteRows.length === 0) return bad('note not found', 404);

    const noteRow = noteRows[0] as any;
    const meta = (metaRows as any[])[0];
    const sourceUrls: string[] = Array.isArray(meta?.source_documents) ? meta.source_documents : [];
    const hasSections = (existingSections as any[]).length > 0;
    const isDesignPath = sourceUrls.length > 0;

    // Look up the doc-type's sections_mode so we can override the instruction
    // for short-form docs (email / memo). Without this, the transform would
    // create multi-section structured docs for emails too.
    const docTypeRow = (docTypeRows as any[]).find(d => d.key === noteRow.doc_type);
    const isSingleSection = docTypeRow?.sections_mode === 'single_section';

    let instruction: string;
    let path: 'visual' | 'refresh' | 'text';
    let useFullCorpus = false;

    if (isDesignPath && !hasSections) {
      instruction = isSingleSection
        ? SINGLE_SECTION_DRAFT_INSTRUCTION
        : structuredDraftInstruction('documents');
      path = 'visual';
      // Initial draft turn → orchestrator automatically uses full corpus.
    } else if (isDesignPath && hasSections) {
      instruction = REFRESH_INSTRUCTION;
      path = 'refresh';
      useFullCorpus = true;
    } else {
      const draftText = noteRow.draft_text as string;
      if (!draftText?.trim()) return bad('no draft text to transform — add source documents or generate a draft first');
      instruction = isSingleSection
        ? SINGLE_SECTION_DRAFT_INSTRUCTION
        : structuredDraftInstruction('draft');
      path = 'text';
    }

    const result = await runOrchestrator({
      noteId: id,
      instruction,
      scopeOverride: undefined, // use sticky scope or doc-type default
      sectionFilter: undefined,
      parentVersionId: null,
      createdBy: 'transform',
      useFullCorpus,
    });

    if (result.clarification_request) {
      return bad(`Transform paused awaiting clarification: ${result.clarification_request.message}`, 409);
    }

    await sql`UPDATE grant_notes SET status = 'designing', updated_at = now() WHERE id = ${id}::uuid`;

    const sectionCount = await sql`
      SELECT COUNT(*)::int AS n FROM grant_note_sections WHERE note_id = ${id}::uuid
    `.catch(() => [{ n: 0 }] as any[]);

    return ok({ sections: (sectionCount as any[])[0]?.n ?? 0, path, version_id: result.version_id });
  } catch (e: any) {
    console.error('Transform route error:', e?.message, e?.stack);
    return bad(`Transform failed: ${e?.message || 'unknown'}`);
  }
}
