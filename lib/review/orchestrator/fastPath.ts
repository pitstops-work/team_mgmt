// Fast-path: detect instructions that can be applied server-side without an
// LLM call. Conservative — patterns must match exactly. Anything ambiguous
// falls through to the orchestrator's normal Claude call.
//
// Currently handles:
//   - Delete a section by key
//   - Rename a section's key
//   - Reorder sections by comma-separated keys
//   - Remove a literal word or phrase (find-and-delete with whitespace cleanup)
//   - Replace a literal word or phrase with another
//
// All of these are deterministic — no judgement required, no rewriting of
// surrounding content. If the user means something more nuanced, they'll get
// it via the LLM path instead.

import { DocumentState, Section } from './state';

export type FastPathResult = {
  working: DocumentState;
  remap: Record<string, string | null>;
  capabilityCalls: Array<{ tool: string; args: unknown; summary: string }>;
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function stripHtmlTextOnly(html: string, mutate: (text: string) => string): string {
  // Replace text node contents while preserving tags. Naïve but adequate for
  // the simple TipTap-generated HTML our sections use.
  return html.replace(/>([^<]+)</g, (_, text) => `>${mutate(text)}<`);
}

function findSectionByKey(sections: Section[], key: string): Section | undefined {
  return sections.find(s => s.section_key === key);
}

export function tryFastPath(
  instruction: string,
  before: DocumentState,
  sectionFilter?: string[],
): FastPathResult | null {
  const raw = instruction.trim().replace(/[\.\!]+$/g, '');
  const lower = raw.toLowerCase();

  // ── Delete section ─────────────────────────────────────────────────────────
  let m = /^(?:delete|remove)\s+(?:the\s+)?section\s+(\S+)$/i.exec(raw);
  if (m) {
    const targetKey = m[1].toLowerCase();
    const sec = findSectionByKey(before.sections, targetKey);
    if (!sec) return null;
    const working = clone(before);
    working.sections = working.sections.filter(s => s.section_key !== targetKey);
    working.sections.forEach((s, i) => { s.sort_order = i; });
    return {
      working,
      remap: { [targetKey]: null },
      capabilityCalls: [{
        tool: 'delete_section',
        args: { section_key: targetKey },
        summary: `[fast-path] Removed section ${targetKey}.`,
      }],
    };
  }

  // ── Rename section ─────────────────────────────────────────────────────────
  m = /^rename\s+(?:the\s+)?section\s+(\S+)\s+to\s+(\S+)$/i.exec(raw);
  if (m) {
    const oldKey = m[1].toLowerCase();
    const newKey = m[2].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const sec = findSectionByKey(before.sections, oldKey);
    if (!sec) return null;
    if (before.sections.some(s => s.section_key === newKey)) return null;
    const working = clone(before);
    const target = working.sections.find(s => s.section_key === oldKey)!;
    target.section_key = newKey;
    return {
      working,
      remap: { [oldKey]: newKey },
      capabilityCalls: [{
        tool: 'rename_section',
        args: { old_key: oldKey, new_key: newKey },
        summary: `[fast-path] Renamed ${oldKey} → ${newKey}.`,
      }],
    };
  }

  // ── Reorder sections ───────────────────────────────────────────────────────
  m = /^reorder\s+sections?(?:\s+to)?\s*:?\s*(.+)$/i.exec(raw);
  if (m) {
    const keys = m[1].split(/[,\s]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
    if (keys.length !== before.sections.length) return null;
    const seen = new Set<string>();
    for (const k of keys) {
      if (seen.has(k)) return null;
      seen.add(k);
      if (!findSectionByKey(before.sections, k)) return null;
    }
    const working = clone(before);
    const byKey = new Map(working.sections.map(s => [s.section_key, s]));
    working.sections = keys.map(k => byKey.get(k)!);
    working.sections.forEach((s, i) => { s.sort_order = i; });
    return {
      working,
      remap: {},
      capabilityCalls: [{
        tool: 'reorder_sections',
        args: { order: keys },
        summary: `[fast-path] Reordered ${keys.length} sections.`,
      }],
    };
  }

  // ── Remove a literal word or phrase ────────────────────────────────────────
  // Patterns: "remove the word 'X'", "remove 'X'", "stop using 'X'"
  m = /^(?:remove|delete|drop|strip|stop\s+using)\s+(?:the\s+)?(?:word|phrase|term)?\s*["'“”]([^"'“”]+)["'“”]$/i.exec(raw);
  if (m) {
    const needle = m[1];
    if (!needle) return null;
    const working = clone(before);
    const filterSet = sectionFilter && sectionFilter.length > 0 ? new Set(sectionFilter) : null;
    let changed = 0;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    for (const sec of working.sections) {
      if (filterSet && !filterSet.has(sec.section_key)) continue;
      if (!sec.content_html) continue;
      const before = sec.content_html;
      sec.content_html = stripHtmlTextOnly(before, t => t.replace(re, ''))
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1');
      if (sec.content_html !== before) changed += 1;
    }
    if (changed === 0) return null;
    return {
      working,
      remap: {},
      capabilityCalls: [{
        tool: 'replace_section_html',
        args: { strategy: 'remove_literal', needle, sections_changed: changed },
        summary: `[fast-path] Removed "${needle}" from ${changed} section${changed === 1 ? '' : 's'}.`,
      }],
    };
  }

  // ── Replace one literal with another ───────────────────────────────────────
  m = /^replace\s+["'“”]([^"'“”]+)["'“”]\s+with\s+["'“”]([^"'“”]+)["'“”]$/i.exec(raw);
  if (m) {
    const needle = m[1];
    const replacement = m[2];
    if (!needle) return null;
    const working = clone(before);
    const filterSet = sectionFilter && sectionFilter.length > 0 ? new Set(sectionFilter) : null;
    let changed = 0;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    for (const sec of working.sections) {
      if (filterSet && !filterSet.has(sec.section_key)) continue;
      if (!sec.content_html) continue;
      const beforeHtml = sec.content_html;
      sec.content_html = stripHtmlTextOnly(beforeHtml, t => t.replace(re, replacement));
      if (sec.content_html !== beforeHtml) changed += 1;
    }
    if (changed === 0) return null;
    return {
      working,
      remap: {},
      capabilityCalls: [{
        tool: 'replace_section_html',
        args: { strategy: 'replace_literal', needle, replacement, sections_changed: changed },
        summary: `[fast-path] Replaced "${needle}" → "${replacement}" in ${changed} section${changed === 1 ? '' : 's'}.`,
      }],
    };
  }

  // Mark `lower` as used so eslint stays quiet on the unused-var pass; the
  // patterns above all run on `raw` (case-preserving), but a future fast-path
  // for purely-lowercase shortcut commands could lean on `lower`.
  void lower;

  return null;
}
