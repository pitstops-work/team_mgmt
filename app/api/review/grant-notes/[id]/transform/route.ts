import Anthropic from '@anthropic-ai/sdk';
import { sql, ok, bad } from '@/lib/review/db';
import { downloadAndProcess, buildMessageContent, uploadImagesToBlob } from '@/lib/review/processFiles';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function ensureTables() {
  await Promise.all([
    sql`
      CREATE TABLE IF NOT EXISTS grant_note_sections (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        note_id uuid NOT NULL,
        section_key text NOT NULL,
        section_num text DEFAULT '',
        title text NOT NULL,
        content_html text DEFAULT '',
        prompt_text text DEFAULT '',
        blocks jsonb DEFAULT '[]',
        sort_order int NOT NULL DEFAULT 0,
        updated_at timestamptz DEFAULT now(),
        UNIQUE(note_id, section_key)
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS grant_note_section_comments (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        note_id uuid NOT NULL,
        section_key text NOT NULL,
        reviewer_id uuid NOT NULL,
        body text NOT NULL,
        created_at timestamptz DEFAULT now(),
        deleted_at timestamptz
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS grant_note_section_acks (
        note_id uuid NOT NULL,
        section_key text NOT NULL,
        reviewer_id uuid NOT NULL,
        created_at timestamptz DEFAULT now(),
        PRIMARY KEY (note_id, section_key, reviewer_id)
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS grant_note_section_votes (
        note_id uuid NOT NULL,
        block_id text NOT NULL,
        reviewer_id uuid NOT NULL,
        vote_position text NOT NULL,
        created_at timestamptz DEFAULT now(),
        PRIMARY KEY (note_id, block_id, reviewer_id)
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS grant_note_metadata (
        note_id uuid PRIMARY KEY,
        vitals jsonb DEFAULT '{}',
        diagrams jsonb DEFAULT '[]',
        source_documents jsonb DEFAULT '[]',
        staff_notes text DEFAULT ''
      )
    `,
  ]);
}

// ── VISUAL DESIGN SYSTEM PROMPT ────────────────────────────────────────────────
// Used when source documents are available (design path)

const VISUAL_DESIGN_SYSTEM = `You produce a structured visual review document from uploaded source materials for a leadership grant approval portal.

Output ONLY valid JSON — no markdown fences, no prose.

Schema:
{
  "vitals": {
    "grant_amount": "₹74.64L",
    "duration": "3 years",
    "beneficiaries": "5,000 adolescent girls",
    "staff_count": "24 staff + 6 field coordinators",
    "geography": "Bhalaswa Dairy Colony, North Delhi",
    "grant_number": "2nd",
    "dependency_pct": 48
  },
  "donor_breakdown": [
    { "name": "Azim Premji Foundation", "pct": 48, "label": "₹36L" },
    { "name": "Government / CSR", "pct": 32, "label": "₹24L" }
  ],
  "diagrams": [
    {
      "key": "programme_flow",
      "title": "Programme Logic",
      "definition": "graph LR\n  A[Girls aged 14-18] --> B[Life skills sessions] --> C[Peer network] --> D[Delayed marriage & economic agency]"
    }
  ],
  "sections": [
    {
      "key": "s1",
      "num": "I",
      "title": "Context",
      "content_html": "<p>Rich HTML...</p>",
      "prompt": "Probing reviewer question",
      "blocks": [
        { "id": "d1", "type": "decision", "text": "Decision statement (20-35 words)" }
      ]
    }
  ]
}

VITALS rules:
- Extract exact numbers from documents — never round or approximate
- dependency_pct: this grant as a percentage of the org's total annual budget
- If a field is not found in the documents, omit it (don't guess)

DONOR_BREAKDOWN rules:
- Array of all funding sources with name, % share, and amount label
- Include government, CSR, foreign, own funds — whatever is in the documents

DIAGRAM rules:
- 0-2 Mermaid diagrams where a flow genuinely adds clarity (programme logic, delivery chain)
- NEVER call it "theory of change" — use "programme logic", "delivery flow", "supply chain" etc.
- Use graph LR for flows; gantt for timelines with known dates
- Keep simple: 4-8 nodes max, real labels from the documents
- Omit if the flow is trivial or data is insufficient

SECTION rules:
- 6-9 sections total (visual document — punchy, not exhaustive)
- Follow the document's own structure; don't invent sections
- Each section: 3-6 bullet points or a tight paragraph — surface key facts, not all text
- Last section MUST be "Our Sense" using the staff assessment provided
- Typical order: Context → Programme → [Key theme sections] → Financial → Our Sense

CONTENT_HTML allowed elements:
- <p> <strong> <em> <ul> <ol> <li>
- <table class="data-table"><thead><tbody><tr><th><td> — reproduce tables from source docs exactly
- <div class="stat-row"><div class="stat-item"><span class="stat-val">X</span><span class="stat-label">Y</span></div></div> — for key number callouts
- <figure class="doc-image"><img src="BLOB_URL" alt="short description" /><figcaption>Caption describing what this shows</figcaption></figure> — when you have been told the blob URL for an image you can see; use the exact URL provided
- <div class="image-ref"><div class="image-ref-label">Title</div><p class="image-ref-desc">Describe in 2-3 sentences</p></div> — when you can see an image/schematic but have NOT been given its URL

BLOCK rules:
- decision: board-level call required (concentration risk, conditionality, significant concern)
- assumption: implicit claim to verify (count accuracy, capacity, replicability)
- settled: position leadership has already agreed
- 0-2 per section, only where genuinely warranted
- Block ids globally unique: d1, d2… decisions; a1, a2… assumptions; s1, s2… settled
- 20-35 words, declarative form`;

// ── TEXT DESIGN SYSTEM PROMPT ──────────────────────────────────────────────────
// Used when only draft_text is available (draft path → design editor)

const TEXT_TRANSFORM_SYSTEM = `You convert a raw internal grant note or programme design note into structured JSON for a visual leadership review portal.

Output ONLY valid JSON — no markdown fences, no prose.

Schema:
{
  "sections": [
    {
      "key": "s1",
      "num": "I",
      "title": "Section Title",
      "start": 5,
      "end": 23,
      "prompt": "One probing question for leadership reviewers",
      "blocks": [
        { "id": "d1", "type": "decision", "text": "Decision statement (20-35 words)" }
      ]
    }
  ]
}

FIELDS:
- key: short snake_case id, unique (s1, s2, …)
- num: Roman numeral (I, II, III, …)
- title: concise section name
- start / end: 0-based line indices (inclusive) of this section in the draft
- prompt: one specific, probing sentence — genuine tension or judgement call, never generic
- blocks: 0-2 per section, only where warranted

SECTION rules:
- Follow the note's own structure; don't invent
- Grant notes: separate sections for Donor Diversity | Statutory | Financial Summary | Budget | Remarks
- Annexure / detailed budget: its own section if present
- Typical: 10-16 sections for grant notes, 7-10 for programme design

BLOCK types:
- decision: board-level call (concentration risk, conditionality, borderline quality, major risk)
- assumption: implicit claim to verify (beneficiary count, audit reliability, replicability)
- settled: leadership position already agreed
- Ids globally unique: d1, d2… decisions; a1, a2… assumptions; s1, s2… settled`;

// ── Helper: convert draft text lines to HTML ──────────────────────────────────

function linesToHtml(lines: string[]): string {
  const parts: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (line.trim().startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c && !/^-+$/.test(c));
      if (cells.length > 0) parts.push(`<p>${cells.join(' &nbsp;|&nbsp; ')}</p>`);
      continue;
    }
    const bulletMatch = line.match(/^\s*[-•*]\s+(.+)/);
    if (bulletMatch) {
      const text = bulletMatch[1].replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      parts.push(`<li>${text}</li>`);
      continue;
    }
    const headingMatch = line.match(/^#{1,3}\s+(.+)/) || line.match(/^\*\*([^*]+)\*\*\s*$/);
    if (headingMatch) {
      parts.push(`<p><strong>${headingMatch[1].trim()}</strong></p>`);
      continue;
    }
    const text = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    parts.push(`<p>${text}</p>`);
  }
  const html = parts.join('\n');
  return html.replace(/(<li>[\s\S]*?<\/li>(\n<li>[\s\S]*?<\/li>)*)/g, '<ul>$1</ul>');
}

// ── Helper: save sections to DB ───────────────────────────────────────────────

async function saveSections(noteId: string, sections: Array<{
  key: string; num: string; title: string;
  content_html: string; prompt: string; blocks: any[];
}>) {
  await sql`DELETE FROM grant_note_sections WHERE note_id = ${noteId}::uuid`;
  await Promise.all(
    sections.map((s, i) => sql`
      INSERT INTO grant_note_sections
        (note_id, section_key, section_num, title, content_html, prompt_text, blocks, sort_order)
      VALUES (
        ${noteId}::uuid, ${s.key}, ${s.num}, ${s.title},
        ${s.content_html}, ${s.prompt}, ${JSON.stringify(s.blocks)}::jsonb, ${i}
      )
    `)
  );
}

// ── VISUAL DESIGN TRANSFORM ───────────────────────────────────────────────────

async function runVisualDesignTransform(
  noteId: string,
  sourceUrls: string[],
  staffNotes: string,
  noteRow: any
) {
  const { textDocs, imageDocs, pdfDocs, budgetParts, extractedImages } = await downloadAndProcess(sourceUrls, true);
  // Upload images extracted from PPTX/DOCX to Blob so Claude can reference them by URL
  const uploadedImages = await uploadImagesToBlob(extractedImages);
  const docContent = buildMessageContent(textDocs, imageDocs, pdfDocs, budgetParts, uploadedImages);

  const metaText = `
METADATA:
Organisation: ${noteRow.org_name}${noteRow.org_city ? `, ${noteRow.org_city}` : ''}
Meeting: ${noteRow.meeting || ''}
Theme: ${noteRow.theme || ''}
Grant amount: ${noteRow.grant_amount || ''}
Duration: ${noteRow.grant_duration ? `${noteRow.grant_duration} years` : ''}
Grant number: ${noteRow.grant_number || ''}
Doc type: ${noteRow.doc_type || 'grant_note'}

STAFF ASSESSMENT (Our sense of the org):
${staffNotes || '[No staff assessment provided]'}

Generate the visual design JSON from the documents above.`.trim();

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: VISUAL_DESIGN_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        ...docContent,
        { type: 'text', text: metaText },
      ],
    }],
  });

  const raw = (msg.content.find((b: any) => b.type === 'text') as any)?.text || '';
  const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  let parsed: { vitals?: any; donor_breakdown?: any[]; diagrams?: any[]; sections: any[] };
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error('Visual design JSON parse failed. Raw:', raw.slice(0, 500));
    throw new Error('Claude returned invalid JSON — try again');
  }

  if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error('No sections returned');
  }

  // Save vitals + diagrams to metadata
  await sql`
    INSERT INTO grant_note_metadata (note_id, vitals, diagrams, source_documents, staff_notes)
    VALUES (
      ${noteId}::uuid,
      ${JSON.stringify(parsed.vitals || {})}::jsonb,
      ${JSON.stringify(parsed.diagrams || [])}::jsonb,
      ${JSON.stringify(sourceUrls)}::jsonb,
      ${staffNotes || ''}
    )
    ON CONFLICT (note_id) DO UPDATE
      SET vitals = ${JSON.stringify(parsed.vitals || {})}::jsonb,
          diagrams = ${JSON.stringify(parsed.diagrams || [])}::jsonb
  `;

  const sections = parsed.sections.map((s: any, i: number) => ({
    key: String(s.key || `s${i + 1}`),
    num: String(s.num || ''),
    title: String(s.title || 'Untitled'),
    content_html: String(s.content_html || ''),
    prompt: String(s.prompt || ''),
    blocks: Array.isArray(s.blocks) ? s.blocks : [],
  }));

  await saveSections(noteId, sections);
  return sections.length;
}

// ── CONTENT REFRESH (visual path, sections already exist) ────────────────────
// Preserves section keys, titles, prompts, blocks — updates only content_html,
// vitals, and diagrams from the (possibly revised) source documents.

const CONTENT_REFRESH_SYSTEM = `You refresh the content of an existing structured grant review document using updated or revised source materials. The section structure is fixed — do not add, remove, or rename sections.

Output ONLY valid JSON — no markdown fences, no prose.

Schema:
{
  "vitals": {
    "grant_amount": "₹74.64L",
    "duration": "3 years",
    "beneficiaries": "5,000 adolescent girls",
    "staff_count": "24 staff + 6 field coordinators",
    "geography": "Bhalaswa Dairy Colony, North Delhi",
    "grant_number": "2nd",
    "dependency_pct": 48
  },
  "diagrams": [
    { "key": "programme_flow", "title": "Programme Logic", "definition": "graph LR\\n  A[...] --> B[...]" }
  ],
  "sections": [
    { "key": "s1", "content_html": "<p>Updated content from revised docs</p>" }
  ]
}

RULES:
- sections MUST include ALL provided section keys, in the same order — do not skip any
- content_html: fresh content drawn from the updated documents; same allowed elements as always
- vitals: re-extract exact numbers from updated docs; omit fields not found
- diagrams: 0-2 Mermaid diagrams (graph LR or gantt); NEVER "theory of change"
- content_html allowed: <p> <strong> <em> <ul> <ol> <li> <table class="data-table">...</table> <div class="stat-row">...</div> <figure class="doc-image"><img src="BLOB_URL" alt="..." /><figcaption>...</figcaption></figure> <div class="image-ref">...</div>
- 3-6 bullets or a tight paragraph per section — punchy, not exhaustive`;

async function runContentRefresh(
  noteId: string,
  sourceUrls: string[],
  staffNotes: string,
  noteRow: any,
  existingSections: Array<{ section_key: string; title: string }>
) {
  const { textDocs, imageDocs, pdfDocs, budgetParts, extractedImages } = await downloadAndProcess(sourceUrls, true);
  const uploadedImages = await uploadImagesToBlob(extractedImages);
  const docContent = buildMessageContent(textDocs, imageDocs, pdfDocs, budgetParts, uploadedImages);

  const sectionList = existingSections
    .map(s => `${s.section_key}: ${s.title}`)
    .join('\n');

  const metaText = `
METADATA:
Organisation: ${noteRow.org_name}${noteRow.org_city ? `, ${noteRow.org_city}` : ''}
Meeting: ${noteRow.meeting || ''}
Theme: ${noteRow.theme || ''}
Grant amount: ${noteRow.grant_amount || ''}
Duration: ${noteRow.grant_duration ? `${noteRow.grant_duration} years` : ''}
Grant number: ${noteRow.grant_number || ''}
Doc type: ${noteRow.doc_type || 'grant_note'}

EXISTING SECTIONS — update content_html for each key, all must appear in output:
${sectionList}

STAFF ASSESSMENT (Our sense of the org):
${staffNotes || '[No staff assessment provided]'}

Refresh the content from the updated documents above.`.trim();

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: CONTENT_REFRESH_SYSTEM,
    messages: [{
      role: 'user',
      content: [...docContent, { type: 'text', text: metaText }],
    }],
  });

  const raw = (msg.content.find((b: any) => b.type === 'text') as any)?.text || '';
  const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  let parsed: { vitals?: any; diagrams?: any[]; sections: Array<{ key: string; content_html: string }> };
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error('Content refresh JSON parse failed. Raw:', raw.slice(0, 500));
    throw new Error('Claude returned invalid JSON — try again');
  }

  if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error('No sections returned');
  }

  // Update vitals + diagrams
  await sql`
    UPDATE grant_note_metadata
    SET vitals   = ${JSON.stringify(parsed.vitals || {})}::jsonb,
        diagrams = ${JSON.stringify(parsed.diagrams || [])}::jsonb
    WHERE note_id = ${noteId}::uuid
  `;

  // Update content_html only — preserve title, prompt_text, blocks, sort_order
  await Promise.all(
    parsed.sections.map(s => sql`
      UPDATE grant_note_sections
      SET content_html = ${String(s.content_html || '')},
          updated_at   = now()
      WHERE note_id    = ${noteId}::uuid
        AND section_key = ${String(s.key)}
    `)
  );

  return parsed.sections.length;
}

// ── TEXT-BASED TRANSFORM ──────────────────────────────────────────────────────

async function runTextTransform(noteId: string, draftText: string) {
  const draftLines = draftText.split('\n');

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: TEXT_TRANSFORM_SYSTEM,
    messages: [{
      role: 'user',
      content: `Analyse this note. Line numbers start at 0.\n\nDRAFT (${draftLines.length} lines):\n${draftLines.map((l, i) => `${i}: ${l}`).join('\n')}`,
    }],
  });

  const raw = (msg.content.find((b: any) => b.type === 'text') as any)?.text || '';
  const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  let parsed: { sections: any[] };
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error('Text transform JSON parse failed. Raw:', raw.slice(0, 500));
    throw new Error('Claude returned invalid JSON — try again');
  }

  if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error('No sections returned');
  }

  const sections = parsed.sections.map((s: any, i: number) => {
    const start = Number(s.start ?? 0);
    const end = Number(s.end ?? draftLines.length - 1);
    return {
      key: String(s.key || `s${i + 1}`),
      num: String(s.num || ''),
      title: String(s.title || 'Untitled'),
      content_html: linesToHtml(draftLines.slice(start, end + 1)),
      prompt: String(s.prompt || ''),
      blocks: Array.isArray(s.blocks) ? s.blocks : [],
    };
  });

  await saveSections(noteId, sections);
  return sections.length;
}

// ── ROUTE HANDLER ─────────────────────────────────────────────────────────────

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [, noteRows, metaRows, existingSections] = await Promise.all([
      ensureTables(),
      sql`SELECT org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration, doc_type, draft_text FROM grant_notes WHERE id = ${id}::uuid`,
      sql`SELECT source_documents, staff_notes FROM grant_note_metadata WHERE note_id = ${id}::uuid`.catch(() => []),
      sql`SELECT section_key, title FROM grant_note_sections WHERE note_id = ${id}::uuid ORDER BY sort_order ASC`.catch(() => []),
    ]);

    if (noteRows.length === 0) return bad('note not found', 404);

    const noteRow = noteRows[0] as any;
    const meta = (metaRows as any[])[0];
    const sourceUrls: string[] = Array.isArray(meta?.source_documents) ? meta.source_documents : [];
    const isDesignPath = sourceUrls.length > 0;
    const sections = existingSections as Array<{ section_key: string; title: string }>;

    let sectionCount: number;
    let path: string;

    if (isDesignPath) {
      if (sections.length > 0) {
        // Sections exist — preserve structure, refresh content only
        sectionCount = await runContentRefresh(
          id, sourceUrls, meta?.staff_notes || '', noteRow, sections
        );
        path = 'refresh';
      } else {
        // First transform — build everything from scratch
        sectionCount = await runVisualDesignTransform(
          id, sourceUrls, meta?.staff_notes || '', noteRow
        );
        path = 'visual';
      }
    } else {
      const draftText = noteRow.draft_text as string;
      if (!draftText?.trim()) return bad('no draft text to transform — add source documents or generate a draft first');
      sectionCount = await runTextTransform(id, draftText);
      path = 'text';
    }

    await sql`UPDATE grant_notes SET status = 'designing', updated_at = now() WHERE id = ${id}::uuid`;

    return ok({ sections: sectionCount, path });
  } catch (e: any) {
    console.error('Transform route error:', e.message, e.stack);
    return bad(`Transform failed: ${e.message}`);
  }
}
