// Orchestrator turn instructions.
//
// The capability fragments (structure / language / financial / cost / format)
// and the doc-type's template_rules supply the *rules*; these supply the *task*
// for a turn. They live here rather than inside the /transform route so they can
// be exercised and regenerated outside an HTTP request.

// These instructions encode what the three legacy inline system prompts used
// to ask Claude for. The structure/language/financial/cost/format capability
// fragments supply the *rules*; the instruction below supplies the *task* for
// this turn. Tuning the instruction or the structure capability's prompt
// fragment is now sufficient to shift behaviour — no inline prompt edits.

// One brief for both initial-draft paths. It used to be two, and the shallower
// of them ran when source documents were present: "6-9 sections ... 3-6 bullet
// points", which produces a summary deck, not an approval note. The section
// count now comes from the doc-type's template rules rather than from here, so
// editing the template in /grant-notes/admin is enough to change the shape.
export function structuredDraftInstruction(from: 'documents' | 'draft'): string {
  const source = from === 'documents'
    ? 'the attached source materials'
    : 'the existing draft text (provided in the document state above)';

  return `Generate the complete structured review document from ${source}.

Use the seed_document tool ONCE to emit everything in a single call.

SECTIONS — follow the document structure given by the structure capability and the
doc-type template rules above, EXACTLY. That template is the contract:
  - Emit one section per block it names, in its order, including every annexure it
    lists. A grant note runs to its last annexure, not to the main table.
  - Do not merge several of the template's blocks into one section, and do not
    invent sections it does not name.
  - Do not stop early. A template block with no source material still gets its
    section, with "[to be filled]" inside it.
The last section is "Our Sense" / "Our sense of their work", built from the staff
assessment in the metadata when there is one.

DEPTH — write as much as ${from === 'documents' ? 'the documents' : 'the draft'} supports.
There is no bullet budget: a section backed by detailed source material should carry
that detail. Reproduce every figure the source states — settlement and ward counts,
household numbers, staff numbers and salaries, per-unit costs, dates. Do not replace a
figure with "substantial", "several" or "significant", and do not round one.

NUMBERS — never invent, infer, estimate or round. Use the figure the source states, or
"[to be filled]". If a source document is reported as unreadable or incomplete, say so
in the affected section rather than concluding the fact is absent.

SCOPE — where a budget is attached, the grant is what the budget funds. Describe those
components as the grant; anything the application proposes but the budget does not fund
belongs in the "any other information" annexure, named as out of scope for this grant.

BUDGET ANNEXURE — itemise from the budget file: every category with its amount and
percentage, and the line items under each, largest first. Do not write "to be provided".

VITALS — extract exact numbers from the source (never round or guess). Include keys
where data exists: grant_amount, duration, beneficiaries, staff_count, geography,
grant_number, dependency_pct. Omit any field whose value is not found.

DIAGRAMS — 0-2 Mermaid diagrams where a flow genuinely adds clarity (programme logic,
delivery flow, supply chain). Use 'graph LR' for flows, 'gantt' for timelines with known
dates. NEVER label a diagram "theory of change". Keep them simple: 4-8 nodes, real
labels from the source. Omit if the flow is trivial or the data is insufficient.

CONTENT_HTML allowed elements: see the format capability above. Reproduce tables from
source documents exactly inside <table class="data-table">.`;
}

export const REFRESH_INSTRUCTION = `Refresh the content of the existing structured document using the updated source materials.

CRITICAL — the section structure is FIXED. Do not add, remove, or rename any sections. Do not change section titles or reader prompts. Use replace_section_html (without passing a new title or prompt_text) for each section whose content needs updating from the refreshed corpus. Also call set_vitals and set_diagrams with re-extracted values from the updated documents.

For each existing section, re-derive content_html from the updated source materials. Omit any vitals fields where the data is no longer found. Diagrams may be adjusted or omitted entirely.`;


// Single-section override used when the doc-type's sections_mode is single_section
// (e.g. email, short note). Same path through the orchestrator, but the model is
// told to produce exactly ONE section regardless of which path triggered it.
export const SINGLE_SECTION_DRAFT_INSTRUCTION = `Generate the document as a SINGLE section using seed_document with EXACTLY one entry.

This is a short-form document (email, memo, or brief note) — do NOT split content into multiple sections, do NOT add Executive Summary / Context / Effects / etc. Treat the draft text or source materials as one coherent body and produce one section with section_key="body" and a brief, descriptive title.

VITALS — leave empty unless the document explicitly contains key/value data that belongs at the top.
DIAGRAMS — none.`;

