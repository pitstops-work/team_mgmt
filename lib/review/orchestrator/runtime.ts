// Orchestrator runtime — one Claude call per turn.
//
// Decisions baked in here (from the architecture conversation):
//   - One Claude call per turn (max 2 with a repair pass)
//   - Capabilities are prompt fragments — they don't fan out to extra calls
//   - Editor primitives are always available regardless of scope
//   - Hybrid retrieval: cached full corpus on initial draft, RAG on refinement
//   - Section-key remap cascades to comments/acks (see state.ts)

import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../db';
import { getCapabilitiesByIds, Capability, defaultCapabilityIdsForDocType } from '../capabilities';
import {
  DocumentState, Section, loadDocumentState, persistDocumentState,
  computeDiff, renderDocumentStateForModel, Diff,
} from './state';
import { EDITOR_TOOLS } from './tools';
import { snapshotVersion } from '../versions';
import { embedQuery, toPgVector } from '../embedding';
import { downloadAndProcess, buildMessageContent } from '../processFiles';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 16000;
const RAG_TOP_K = 8;

// ── Public types ─────────────────────────────────────────────────────────────

export type OrchestrateInput = {
  noteId: string;
  instruction: string;
  scopeOverride?: string[];
  sectionFilter?: string[];
  parentVersionId?: string | null;
  createdBy?: string;
  /**
   * Phase 4 — used by the refresh-transform path. When true, sends the full
   * source corpus (with cache_control) in addition to or instead of RAG chunks.
   * The initial-draft turn always uses the full corpus regardless of this flag.
   */
  useFullCorpus?: boolean;
};

export type CapabilityCall = {
  tool: string;
  args: unknown;
  summary: string;
};

export type OrchestrateOutput = {
  version_id: string | null;
  version_number: number | null;
  diff: Diff;
  capability_calls: CapabilityCall[];
  clarification_request?: { message: string; suggested_scope?: string[] };
  lint_issues: string[];
  scope_used: string[];
  tokens: { input: number; output: number };
  promotion_candidate?: { normalized: string; count: number };
};

// ── Instruction log + promotion detection ────────────────────────────────────

function normalizeInstruction(text: string): string {
  return text
    .toLowerCase()
    .replace(/section\s+s?\d+/g, 'section X')        // collapse section references
    .replace(/[^a-z0-9\s]+/g, ' ')                    // strip punctuation
    .replace(/\s+/g, ' ')                             // collapse whitespace
    .trim();
}

const PROMOTION_THRESHOLD = 3;

async function logInstructionAndDetect(args: {
  noteId: string;
  versionId: string | null;
  instruction: string;
  capabilitiesUsed: string[];
}): Promise<{ normalized: string; count: number } | null> {
  const normalized = normalizeInstruction(args.instruction);
  if (!normalized) return null;

  try {
    await sql`
      INSERT INTO instruction_log
        (note_id, version_id, instruction, normalized, capabilities_used)
      VALUES
        (${args.noteId}::uuid,
         ${args.versionId ? `${args.versionId}::uuid` as any : null},
         ${args.instruction}, ${normalized}, ${args.capabilitiesUsed as any})
    `;
  } catch (e: any) {
    // Don't fail the turn if instruction_log doesn't exist yet (migration not run).
    if (!/relation .* does not exist/i.test(e?.message || '')) {
      console.warn('[orchestrator] instruction_log insert failed:', e?.message);
    }
    return null;
  }

  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS n FROM instruction_log
      WHERE normalized = ${normalized} AND was_promoted_to IS NULL
    `;
    const count = (rows as any[])[0]?.n ?? 0;
    if (count >= PROMOTION_THRESHOLD) {
      return { normalized, count };
    }
  } catch { /* best-effort */ }

  return null;
}

// ── System prompt assembly ───────────────────────────────────────────────────

const ORCHESTRATOR_BASE = `You are the editor of an internal review document for a philanthropy team. Each user turn provides:
 - the current document state (sections, vitals, diagrams)
 - retrieved source-material chunks (or the full source corpus on initial draft)
 - an instruction describing the change to make
 - the active capability scope — the rules and constraints currently in effect

Your job is to APPLY the instruction by calling the editor tools below. You do not write content in conversational prose — every change must be expressed as a tool call. Use the smallest set of tool calls that satisfies the instruction.

Constraints:
 - Prefer modifying existing sections over creating new ones unless the instruction explicitly adds content.
 - For ambiguous instructions, or when the instruction implies a structural change while only language/format rules are in scope, call \`prompt_user_for_clarification\` and stop instead of guessing.
 - When the document has no sections yet (initial draft), call \`seed_document\` once with the full initial set; do not call \`add_section\` repeatedly.
 - Keep section_keys stable across edits unless a rename is genuinely needed; if you do rename, use \`rename_section\`.
 - The capability scope below describes the rules in effect for this turn. Honor those rules even if not restated in the instruction.

After your tool calls, give a single short summary line of what you did (one sentence, no headers).`;

function isInitialDraftTurn(state: DocumentState): boolean {
  return state.sections.length === 0;
}

function isRuleOnlyScope(caps: Capability[]): boolean {
  // Rule-only = only language/format/cost categories (no structure capability).
  return caps.length > 0 && caps.every(c => c.category === 'language' || c.category === 'format' || c.category === 'cost');
}

function composeSystemPrompt(args: {
  caps: Capability[];
  state: DocumentState;
  sectionFilter?: string[];
}): string {
  const parts: string[] = [ORCHESTRATOR_BASE];

  parts.push('');
  parts.push('ACTIVE CAPABILITIES:');
  if (args.caps.length === 0) {
    parts.push('(none — only editor primitives are available; ask for clarification rather than guessing rule decisions)');
  } else {
    for (const c of args.caps) {
      parts.push(`\n[${c.id}] ${c.label}`);
      parts.push(c.prompt_fragment);
    }
  }

  if (args.sectionFilter && args.sectionFilter.length > 0) {
    parts.push('');
    parts.push(`SECTION FILTER: edits this turn must affect only [${args.sectionFilter.join(', ')}]. Calls to other sections will be rejected.`);
  }

  if (isInitialDraftTurn(args.state)) {
    parts.push('');
    parts.push('INITIAL DRAFT MODE: the document has no sections yet. Call seed_document once with the full initial set drawn from the source corpus. Honor the structure rules above (if any) for section layout.');
  }

  if (isRuleOnlyScope(args.caps)) {
    parts.push('');
    parts.push('SCOPE-NOTE: the active scope is rule-only (no structure capability). Do NOT add or remove sections unless the instruction explicitly requests structural change; if it does, call prompt_user_for_clarification with suggested_scope including "structure" instead.');
  }

  return parts.join('\n');
}

// ── Retrieval (hybrid) ───────────────────────────────────────────────────────

type RetrievedChunk = {
  note_id: string;
  doc_url: string;
  doc_name: string;
  chunk_text: string;
  metadata: Record<string, unknown>;
  distance: number;
};

async function retrieveChunks(noteId: string, query: string): Promise<RetrievedChunk[]> {
  if (!process.env.VOYAGE_API_KEY) return [];
  let vector: number[];
  try {
    vector = await embedQuery(query);
  } catch (e: any) {
    console.warn('[orchestrator] embedQuery failed:', e?.message);
    return [];
  }
  const vecStr = toPgVector(vector);
  try {
    // Cross-note retrieval (locked decision: wide-open inside the portal).
    const rows = await sql`
      SELECT note_id, doc_url, doc_name, chunk_text, metadata,
             embedding <=> ${vecStr}::vector AS distance
      FROM source_chunks
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vecStr}::vector
      LIMIT ${RAG_TOP_K}
    `;
    return (rows as any[]).map(r => ({
      note_id: r.note_id,
      doc_url: r.doc_url,
      doc_name: r.doc_name,
      chunk_text: r.chunk_text,
      metadata: r.metadata || {},
      distance: Number(r.distance),
    }));
  } catch (e: any) {
    console.warn('[orchestrator] RAG query failed (table may not exist yet):', e?.message);
    return [];
  }
}

function renderChunksForModel(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const parts = ['FOCUS CHUNKS (retrieved from source corpus — most relevant to this turn):'];
  for (const c of chunks) {
    parts.push('');
    parts.push(`[from: ${c.doc_name}${c.note_id ? `, note=${c.note_id.slice(0, 8)}` : ''}]`);
    parts.push(c.chunk_text);
  }
  return parts.join('\n');
}

async function fetchSourceCorpusForInitialDraft(noteId: string): Promise<any[]> {
  // Only used on the initial-draft turn — sends the full corpus with cache_control.
  const metaRows = await sql`
    SELECT source_documents FROM grant_note_metadata WHERE note_id = ${noteId}::uuid
  `.catch(() => [] as any[]);
  const urls: string[] = Array.isArray((metaRows as any[])[0]?.source_documents)
    ? (metaRows as any[])[0].source_documents
    : [];
  if (urls.length === 0) return [];
  const { textDocs, imageDocs, pdfDocs, budgetParts } = await downloadAndProcess(urls, true);
  const content = buildMessageContent(textDocs, imageDocs, pdfDocs, budgetParts, []);
  // Attach cache_control to the last block so the whole corpus is cached.
  if (content.length > 0) {
    content[content.length - 1] = {
      ...content[content.length - 1],
      cache_control: { type: 'ephemeral' },
    };
  }
  return content;
}

// ── Tool execution ───────────────────────────────────────────────────────────

type ToolExecutionResult = {
  state: DocumentState;
  remap: Record<string, string | null>;
  capabilityCalls: CapabilityCall[];
  clarification?: { message: string; suggested_scope?: string[] };
  toolErrors: string[];
};

function applyToolUse(
  tool_use: { name: string; input: any },
  working: DocumentState,
  remap: Record<string, string | null>,
  sectionFilter: string[] | undefined,
  errors: string[],
): { stop?: boolean; clarification?: { message: string; suggested_scope?: string[] } } {
  const { name, input } = tool_use;
  const filterAllows = (key: string) => !sectionFilter || sectionFilter.includes(key);

  switch (name) {
    case 'replace_section_html': {
      const key = String(input?.section_key || '');
      const sec = working.sections.find(s => s.section_key === key);
      if (!sec) { errors.push(`replace_section_html: section ${key} not found`); break; }
      if (!filterAllows(key)) { errors.push(`replace_section_html: section ${key} outside filter`); break; }
      sec.content_html = String(input?.html ?? sec.content_html);
      if (typeof input?.title === 'string') sec.title = input.title;
      if (typeof input?.prompt_text === 'string') sec.prompt_text = input.prompt_text;
      break;
    }
    case 'add_section': {
      const key = String(input?.section_key || '');
      if (!key) { errors.push('add_section: section_key required'); break; }
      if (working.sections.some(s => s.section_key === key)) {
        errors.push(`add_section: key ${key} already exists`); break;
      }
      if (!filterAllows(key)) { errors.push(`add_section: key ${key} outside filter`); break; }
      const newSec: Section = {
        section_key: key,
        section_num: String(input?.section_num || ''),
        title: String(input?.title || 'Untitled'),
        content_html: String(input?.content_html || ''),
        prompt_text: String(input?.prompt_text || ''),
        blocks: [],
        sort_order: working.sections.length,
      };
      const afterKey = input?.after_key ? String(input.after_key) : null;
      if (afterKey) {
        const idx = working.sections.findIndex(s => s.section_key === afterKey);
        if (idx >= 0) {
          working.sections.splice(idx + 1, 0, newSec);
          working.sections.forEach((s, i) => { s.sort_order = i; });
          break;
        }
      }
      working.sections.push(newSec);
      working.sections.forEach((s, i) => { s.sort_order = i; });
      break;
    }
    case 'delete_section': {
      const key = String(input?.section_key || '');
      const idx = working.sections.findIndex(s => s.section_key === key);
      if (idx < 0) { errors.push(`delete_section: section ${key} not found`); break; }
      if (!filterAllows(key)) { errors.push(`delete_section: section ${key} outside filter`); break; }
      working.sections.splice(idx, 1);
      working.sections.forEach((s, i) => { s.sort_order = i; });
      remap[key] = null;
      break;
    }
    case 'rename_section': {
      const oldKey = String(input?.old_key || '');
      const newKey = String(input?.new_key || '');
      const sec = working.sections.find(s => s.section_key === oldKey);
      if (!sec) { errors.push(`rename_section: section ${oldKey} not found`); break; }
      if (!newKey || working.sections.some(s => s.section_key === newKey)) {
        errors.push(`rename_section: new_key ${newKey} invalid or already exists`); break;
      }
      sec.section_key = newKey;
      remap[oldKey] = newKey;
      break;
    }
    case 'reorder_sections': {
      const order: string[] = Array.isArray(input?.order) ? input.order.map(String) : [];
      if (order.length !== working.sections.length) {
        errors.push(`reorder_sections: provided ${order.length} keys, document has ${working.sections.length}`); break;
      }
      const byKey = new Map(working.sections.map(s => [s.section_key, s]));
      const reordered: Section[] = [];
      for (const key of order) {
        const s = byKey.get(key);
        if (!s) { errors.push(`reorder_sections: unknown key ${key}`); return { stop: false }; }
        reordered.push(s);
      }
      working.sections = reordered;
      working.sections.forEach((s, i) => { s.sort_order = i; });
      break;
    }
    case 'set_vitals': {
      const v = input?.vitals;
      if (v && typeof v === 'object') working.vitals = v as Record<string, unknown>;
      break;
    }
    case 'set_diagrams': {
      if (Array.isArray(input?.diagrams)) working.diagrams = input.diagrams;
      break;
    }
    case 'seed_document': {
      if (working.sections.length > 0) {
        errors.push('seed_document: document already has sections — use add_section instead');
        break;
      }
      const sectionsIn: any[] = Array.isArray(input?.sections) ? input.sections : [];
      working.sections = sectionsIn.map((s, i) => ({
        section_key: String(s.section_key || `s${i + 1}`),
        section_num: String(s.section_num || ''),
        title: String(s.title || 'Untitled'),
        content_html: String(s.content_html || ''),
        prompt_text: String(s.prompt_text || ''),
        blocks: [],
        sort_order: i,
      }));
      if (input?.vitals && typeof input.vitals === 'object') working.vitals = input.vitals;
      if (Array.isArray(input?.diagrams)) working.diagrams = input.diagrams;
      break;
    }
    case 'prompt_user_for_clarification': {
      return {
        stop: true,
        clarification: {
          message: String(input?.message || 'Clarification needed'),
          suggested_scope: Array.isArray(input?.suggested_scope) ? input.suggested_scope.map(String) : undefined,
        },
      };
    }
    default:
      errors.push(`unknown tool: ${name}`);
  }
  return {};
}

function summariseToolCall(name: string, input: any): string {
  switch (name) {
    case 'replace_section_html': return `Rewrote section ${input?.section_key}.`;
    case 'add_section': return `Added section ${input?.section_key} (${input?.title}).`;
    case 'delete_section': return `Removed section ${input?.section_key}.`;
    case 'rename_section': return `Renamed ${input?.old_key} → ${input?.new_key}.`;
    case 'reorder_sections': return `Reordered ${Array.isArray(input?.order) ? input.order.length : 0} sections.`;
    case 'set_vitals': return 'Updated vitals.';
    case 'set_diagrams': return `Set ${Array.isArray(input?.diagrams) ? input.diagrams.length : 0} diagrams.`;
    case 'seed_document': return `Seeded initial document with ${Array.isArray(input?.sections) ? input.sections.length : 0} sections.`;
    case 'prompt_user_for_clarification': return `Asked user: ${input?.message}`;
    default: return name;
  }
}

// ── Lint (capability post-processing) ────────────────────────────────────────

function lintWorkingState(state: DocumentState, caps: Capability[]): string[] {
  const issues: string[] = [];
  // Forbidden-term check on the language capability, if config_json.forbidden_terms exists.
  for (const c of caps) {
    if (c.category !== 'language') continue;
    const terms = (c.config_json as any)?.forbidden_terms;
    if (!Array.isArray(terms)) continue;
    const lower = (s: string) => s.toLowerCase();
    for (const term of terms) {
      const t = String(term).toLowerCase();
      for (const s of state.sections) {
        const text = stripHtml(s.content_html);
        if (lower(text).includes(t)) {
          issues.push(`Forbidden term "${term}" appears in section ${s.section_key}.`);
        }
      }
    }
  }
  return issues;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Main entry ───────────────────────────────────────────────────────────────

export async function runOrchestrator(input: OrchestrateInput): Promise<OrchestrateOutput> {
  const before = await loadDocumentState(input.noteId);
  if (!before) throw new Error(`note not found: ${input.noteId}`);

  // 1. Resolve active scope.
  const stickyRows = await sql`
    SELECT capability_ids FROM grant_note_scope WHERE note_id = ${input.noteId}::uuid
  `.catch(() => [] as any[]);
  const sticky: string[] = (stickyRows as any[])[0]?.capability_ids || [];
  const docTypeRows = await sql`
    SELECT apply_financial_rules FROM doc_types WHERE key = ${before.doc_type}
  `.catch(() => [] as any[]);
  const docTypeRow = (docTypeRows as any[])[0] || { apply_financial_rules: true };
  const fallback = defaultCapabilityIdsForDocType(docTypeRow);
  const activeIds = input.scopeOverride && input.scopeOverride.length > 0
    ? input.scopeOverride
    : (sticky.length > 0 ? sticky : fallback);
  const caps = await getCapabilitiesByIds(activeIds);

  // 2. Build content for the Claude call.
  const initialDraft = isInitialDraftTurn(before);
  let corpusContent: any[] = [];
  let chunks: RetrievedChunk[] = [];
  if (initialDraft || input.useFullCorpus) {
    corpusContent = await fetchSourceCorpusForInitialDraft(input.noteId);
  } else {
    chunks = await retrieveChunks(input.noteId, input.instruction);
  }

  const systemPrompt = composeSystemPrompt({ caps, state: before, sectionFilter: input.sectionFilter });
  const docBlock = renderDocumentStateForModel(before);
  const chunksBlock = renderChunksForModel(chunks);

  const userTextParts: string[] = [];
  userTextParts.push('CURRENT DOCUMENT:');
  userTextParts.push(docBlock);
  if (chunksBlock) { userTextParts.push(''); userTextParts.push(chunksBlock); }
  userTextParts.push('');
  userTextParts.push(`ACTIVE SCOPE: ${activeIds.join(', ') || '(empty)'}`);
  if (input.sectionFilter && input.sectionFilter.length > 0) {
    userTextParts.push(`SECTION FILTER: ${input.sectionFilter.join(', ')}`);
  }
  userTextParts.push('');
  userTextParts.push('INSTRUCTION:');
  userTextParts.push(input.instruction);

  const userContent: any[] = [];
  for (const c of corpusContent) userContent.push(c);
  userContent.push({ type: 'text', text: userTextParts.join('\n') });

  // 3. Claude call.
  let totalInput = 0;
  let totalOutput = 0;
  const capabilityCalls: CapabilityCall[] = [];
  const toolErrors: string[] = [];
  const remap: Record<string, string | null> = {};
  const working: DocumentState = JSON.parse(JSON.stringify(before));
  let clarification: { message: string; suggested_scope?: string[] } | undefined;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: EDITOR_TOOLS,
    messages: [{ role: 'user', content: userContent }],
  });
  totalInput += msg.usage.input_tokens;
  totalOutput += msg.usage.output_tokens;

  for (const block of msg.content) {
    if (block.type !== 'tool_use') continue;
    capabilityCalls.push({
      tool: block.name,
      args: block.input,
      summary: summariseToolCall(block.name, block.input),
    });
    const r = applyToolUse(
      { name: block.name, input: block.input },
      working,
      remap,
      input.sectionFilter,
      toolErrors,
    );
    if (r.clarification) clarification = r.clarification;
    if (r.stop) break;
  }

  // 4. Lint + repair pass (optional, single retry).
  let lintIssues = clarification ? [] : lintWorkingState(working, caps);
  if (!clarification && lintIssues.length > 0) {
    const repairUserContent: any[] = [
      ...corpusContent,
      { type: 'text', text: [
        'CURRENT DOCUMENT (post-edit, with violations):',
        renderDocumentStateForModel(working),
        '',
        'LINT ISSUES — these must be fixed before this turn can land:',
        ...lintIssues.map(i => '- ' + i),
        '',
        'Emit only the tool calls needed to fix the listed issues.',
      ].join('\n') },
    ];
    const repair = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      tools: EDITOR_TOOLS,
      messages: [{ role: 'user', content: repairUserContent }],
    });
    totalInput += repair.usage.input_tokens;
    totalOutput += repair.usage.output_tokens;
    for (const block of repair.content) {
      if (block.type !== 'tool_use') continue;
      capabilityCalls.push({
        tool: block.name,
        args: block.input,
        summary: `[repair] ${summariseToolCall(block.name, block.input)}`,
      });
      applyToolUse(
        { name: block.name, input: block.input },
        working, remap, input.sectionFilter, toolErrors,
      );
    }
    lintIssues = lintWorkingState(working, caps);
  }

  // 5. Persist.
  let versionId: string | null = null;
  let versionNumber: number | null = null;
  if (!clarification) {
    await persistDocumentState(input.noteId, working, remap);
    versionId = await snapshotVersion({
      noteId: input.noteId,
      trigger: 'orchestrator_turn',
      createdBy: input.createdBy || 'system',
      instruction: input.instruction,
      scopeUsed: activeIds,
      capabilityCalls,
      keyRemap: remap,
    });
    if (versionId) {
      const vrows = await sql`
        SELECT version_number FROM grant_note_versions WHERE id = ${versionId}::uuid
      `.catch(() => [] as any[]);
      versionNumber = (vrows as any[])[0]?.version_number ?? null;
    }
  }

  // 6. Diff.
  const diff = clarification
    ? { added: [], modified: [], removed: [], remapped: [] as Array<[string, string]> }
    : computeDiff(before, working, remap);

  // 7. Log instruction + promotion candidate detection.
  const promotion = clarification
    ? null
    : await logInstructionAndDetect({
        noteId: input.noteId,
        versionId,
        instruction: input.instruction,
        capabilitiesUsed: activeIds,
      });

  return {
    version_id: versionId,
    version_number: versionNumber,
    diff,
    capability_calls: capabilityCalls,
    clarification_request: clarification,
    lint_issues: [...lintIssues, ...toolErrors],
    scope_used: activeIds,
    tokens: { input: totalInput, output: totalOutput },
    promotion_candidate: promotion || undefined,
  };
}
