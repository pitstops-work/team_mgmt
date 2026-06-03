// Phase 4: /transform now routes through the orchestrator. The three legacy
// internal paths (visual / refresh / text) become orchestrator turns with
// crafted instructions. Response shape preserved for backwards compat with
// the design page's "Re-transform / Refresh content" button.

import { sql, ok, bad } from '@/lib/review/db';
import { runOrchestrator } from '@/lib/review/orchestrator/runtime';

export const runtime = 'nodejs';
export const maxDuration = 300;

// These instructions encode what the three legacy inline system prompts used
// to ask Claude for. The structure/language/financial/cost/format capability
// fragments supply the *rules*; the instruction below supplies the *task* for
// this turn. Tuning the instruction or the structure capability's prompt
// fragment is now sufficient to shift behaviour — no inline prompt edits.

const VISUAL_DRAFT_INSTRUCTION = `Generate the initial structured review document from the attached source materials.

Use the seed_document tool ONCE to emit everything in a single call:

VITALS — extract exact numbers from the documents (never round or guess). Include keys where data exists:
  grant_amount, duration, beneficiaries, staff_count, geography, grant_number, dependency_pct.
  Omit any field whose value is not found in the documents.

DIAGRAMS — 0-2 Mermaid diagrams where a flow genuinely adds clarity (programme logic, delivery flow, supply chain).
  Use 'graph LR' for flows, 'gantt' for timelines with known dates.
  NEVER label a diagram "theory of change".
  Keep diagrams simple: 4-8 nodes, real labels from the documents.
  Omit if the flow is trivial or data is insufficient.

SECTIONS — 6-9 sections for a visual review document. Follow the document's own structure as expressed by the structure capability above; do not invent extra sections. Each section: 3-6 bullet points or a tight paragraph surfacing key facts. The last section should be "Our Sense" using the staff assessment from the metadata if available.

CONTENT_HTML allowed elements: see the format capability above. Reproduce tables from source documents exactly inside <table class="data-table">.`;

const REFRESH_INSTRUCTION = `Refresh the content of the existing structured document using the updated source materials.

CRITICAL — the section structure is FIXED. Do not add, remove, or rename any sections. Do not change section titles or reader prompts. Use replace_section_html (without passing a new title or prompt_text) for each section whose content needs updating from the refreshed corpus. Also call set_vitals and set_diagrams with re-extracted values from the updated documents.

For each existing section, re-derive content_html from the updated source materials. Omit any vitals fields where the data is no longer found. Diagrams may be adjusted or omitted entirely.`;

const TEXT_TRANSFORM_INSTRUCTION = `Convert the existing draft text (provided in the document state above) into a structured visual document.

Use the seed_document tool ONCE to emit all sections, vitals, and diagrams in a single call.

SECTIONS — follow the structure capability above. Grant notes typically have 10-16 sections including separate rows for Executive Summary, Context, Goal, Effects, Interventions, People, Donor Diversity, Statutory, Average Annual Spend, Budget Breakdown, and Remarks. Programme designs typically have 7-10. Each section's content_html should be drawn from the matching part of the draft text.

VITALS — extract from the draft where available.

DIAGRAMS — only if the draft references one explicitly.`;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [noteRows, metaRows, existingSections] = await Promise.all([
      sql`SELECT doc_type, draft_text FROM grant_notes WHERE id = ${id}::uuid`,
      sql`SELECT source_documents FROM grant_note_metadata WHERE note_id = ${id}::uuid`.catch(() => [] as any[]),
      sql`SELECT section_key FROM grant_note_sections WHERE note_id = ${id}::uuid LIMIT 1`.catch(() => [] as any[]),
    ]);

    if (noteRows.length === 0) return bad('note not found', 404);

    const noteRow = noteRows[0] as any;
    const meta = (metaRows as any[])[0];
    const sourceUrls: string[] = Array.isArray(meta?.source_documents) ? meta.source_documents : [];
    const hasSections = (existingSections as any[]).length > 0;
    const isDesignPath = sourceUrls.length > 0;

    let instruction: string;
    let path: 'visual' | 'refresh' | 'text';
    let useFullCorpus = false;

    if (isDesignPath && !hasSections) {
      instruction = VISUAL_DRAFT_INSTRUCTION;
      path = 'visual';
      // Initial draft turn → orchestrator automatically uses full corpus.
    } else if (isDesignPath && hasSections) {
      instruction = REFRESH_INSTRUCTION;
      path = 'refresh';
      useFullCorpus = true;
    } else {
      const draftText = noteRow.draft_text as string;
      if (!draftText?.trim()) return bad('no draft text to transform — add source documents or generate a draft first');
      instruction = TEXT_TRANSFORM_INSTRUCTION;
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
