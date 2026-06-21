// Anthropic tool definitions for the orchestrator's editor primitives.
//
// These are emitted by the orchestrator as the *output channel* of a single
// Claude call. The server interprets each tool_use block and applies it to a
// working copy of DocumentState (see runtime.ts).

import type Anthropic from '@anthropic-ai/sdk';

export type ToolName =
  | 'replace_section_html'
  | 'add_section'
  | 'delete_section'
  | 'rename_section'
  | 'reorder_sections'
  | 'set_vitals'
  | 'set_diagrams'
  | 'seed_document'
  | 'prompt_user_for_clarification';

export const EDITOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'replace_section_html',
    description:
      "Replace the content of an existing section. Use for tone changes, content rewrites, or any modification of an existing section's body.",
    input_schema: {
      type: 'object',
      properties: {
        section_key: { type: 'string', description: 'The key of the section to edit (e.g. "s1").' },
        html: { type: 'string', description: 'The new HTML content for the section.' },
        title: { type: 'string', description: 'Optional new title for the section.' },
        prompt_text: { type: 'string', description: 'Optional new reader prompt for the section.' },
      },
      required: ['section_key', 'html'],
    },
  },
  {
    name: 'add_section',
    description:
      'Add a new section to the document. Use when introducing content the document does not yet contain.',
    input_schema: {
      type: 'object',
      properties: {
        section_key: { type: 'string', description: 'A new unique key (e.g. "s12").' },
        title: { type: 'string', description: 'Section title.' },
        section_num: { type: 'string', description: 'Optional numeral (e.g. "I", "II").' },
        content_html: { type: 'string', description: 'Section content as HTML.' },
        prompt_text: { type: 'string', description: 'Optional reader prompt.' },
        after_key: { type: 'string', description: 'Optional — insert after this section_key. Omit to append to end.' },
      },
      required: ['section_key', 'title', 'content_html'],
    },
  },
  {
    name: 'delete_section',
    description:
      'Remove a section from the document. Comments on the deleted section will be archived; reviewer acks will be cleared.',
    input_schema: {
      type: 'object',
      properties: {
        section_key: { type: 'string', description: 'Key of the section to remove.' },
      },
      required: ['section_key'],
    },
  },
  {
    name: 'rename_section',
    description:
      "Rename a section's key. Use when consolidating sections or aligning keys with a new naming scheme. Comments/acks cascade to the new key.",
    input_schema: {
      type: 'object',
      properties: {
        old_key: { type: 'string' },
        new_key: { type: 'string' },
      },
      required: ['old_key', 'new_key'],
    },
  },
  {
    name: 'reorder_sections',
    description: 'Re-sequence the sections. Provide every current section key in the desired new order.',
    input_schema: {
      type: 'object',
      properties: {
        order: { type: 'array', items: { type: 'string' }, description: 'Section keys in the desired order.' },
      },
      required: ['order'],
    },
  },
  {
    name: 'set_vitals',
    description:
      'Replace the document vitals (key/value pairs surfaced in the design header — grant amount, beneficiaries, dependency %, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        vitals: { type: 'object', description: 'Vitals object — only the keys you provide are kept.' },
      },
      required: ['vitals'],
    },
  },
  {
    name: 'set_diagrams',
    description:
      'Replace the document diagrams — Mermaid definitions for genuine PROCESS / sequence / decision / org-flow charts only. ' +
      'Do NOT use this for drawings, floor plans, elevations, sections, maps, or photos: Mermaid cannot represent spatial/architectural content. ' +
      'Embed those as the real source image in a section via <figure class="doc-image"><img src="<source-url>"></figure> instead. ' +
      'Use real newlines or <br/> for multi-line node labels — never a literal backslash-n.',
    input_schema: {
      type: 'object',
      properties: {
        diagrams: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              title: { type: 'string' },
              definition: { type: 'string' },
            },
            required: ['key', 'title', 'definition'],
          },
        },
      },
      required: ['diagrams'],
    },
  },
  {
    name: 'seed_document',
    description:
      'Bulk-create the initial document. Use ONLY when the document has no sections yet (initial draft). Provides all sections, vitals, and diagrams in one call.',
    input_schema: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              section_key: { type: 'string' },
              section_num: { type: 'string' },
              title: { type: 'string' },
              content_html: { type: 'string' },
              prompt_text: { type: 'string' },
            },
            required: ['section_key', 'title', 'content_html'],
          },
        },
        vitals: { type: 'object' },
        diagrams: { type: 'array' },
      },
      required: ['sections'],
    },
  },
  {
    name: 'prompt_user_for_clarification',
    description:
      "Ask the user a question instead of guessing. Use when the instruction is ambiguous or when the requested change is outside the active scope (e.g. a structural change while scope is language-only). Calling this ends the turn — no other tools should be called alongside.",
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The question to ask the user.' },
        suggested_scope: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional — capability ids to add to scope so the instruction can run.',
        },
      },
      required: ['message'],
    },
  },
];
