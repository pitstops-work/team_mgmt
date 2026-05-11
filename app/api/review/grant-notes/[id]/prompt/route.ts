import Anthropic from '@anthropic-ai/sdk';
import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const PROMPT_SYSTEM = `You are editing a single section of an internal grant review document for a philanthropy team. The user provides the current HTML content and an instruction for how to revise it. Apply the instruction and return ONLY the updated HTML content — no JSON, no markdown fences, no commentary before or after.

Allowed HTML elements: <p> <strong> <em> <ul> <ol> <li> <table class="data-table"><thead><tbody><tr><th><td> <div class="stat-row"><div class="stat-item"><span class="stat-val">X</span><span class="stat-label">Y</span></div></div>

Tone rules (non-negotiable): cold, direct, understated. No warm adjectives (impactful, transformative, remarkable, inspiring, passionate, committed, vibrant, dynamic). Short sentences. Concerns stated plainly.

If the instruction asks to add content not in the current HTML, add it using good judgment. If the instruction is vague (e.g. "make it shorter"), cut the least essential content. Do not add section titles or headings unless explicitly asked.`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { instruction, section_key, current_html, include_context } = body;
  if (!instruction?.trim()) return bad('instruction required');
  if (!current_html) return bad('current_html required');

  const [noteRows, sectionRows, allSectionRows] = await Promise.all([
    sql`SELECT org_name, org_city, doc_type, theme FROM grant_notes WHERE id = ${id}::uuid`.catch(() => []),
    sql`SELECT title FROM grant_note_sections WHERE note_id = ${id}::uuid AND section_key = ${section_key}`.catch(() => []),
    include_context
      ? sql`SELECT section_num, title, content_html, section_key FROM grant_note_sections WHERE note_id = ${id}::uuid ORDER BY sort_order ASC`.catch(() => [])
      : Promise.resolve([]),
  ]);

  const note = (noteRows as any[])[0];
  const section = (sectionRows as any[])[0];
  const allSections = allSectionRows as any[];

  const docLine = note
    ? `Document: ${note.org_name}${note.org_city ? ', ' + note.org_city : ''} — ${note.doc_type || 'grant_note'} — Theme: ${note.theme || 'unspecified'}`
    : '';
  const sectionLine = section ? `Section being edited: ${section.title}` : '';

  // Build document context — plain text summary of every other section
  let docContext = '';
  if (include_context && allSections.length > 0) {
    const others = allSections.filter(s => s.section_key !== section_key);
    if (others.length > 0) {
      const summaries = others.map(s => {
        const text = (s.content_html as string)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400);
        return `  ${s.section_num}. ${s.title}: ${text}${text.length === 400 ? '…' : ''}`;
      });
      docContext = `\nOTHER SECTIONS (for cross-section coherence):\n${summaries.join('\n')}\n`;
    }
  }

  const userMessage = [
    docLine,
    sectionLine,
    docContext,
    `CURRENT CONTENT:\n${current_html}`,
    `INSTRUCTION:\n${instruction.trim()}`,
  ].filter(Boolean).join('\n\n');

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: PROMPT_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = (msg.content.find((b: any) => b.type === 'text') as any)?.text || '';
  const clean = raw.replace(/^```(?:html)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  return ok({ content_html: clean });
}
