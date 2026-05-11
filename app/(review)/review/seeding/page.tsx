export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { sql } from '@/lib/review/db';
import { WORKFLOW_HTML, COST_CHART_HTML } from '@/lib/review/seedingAssets';
import { INITIAL_CONTENT, INITIAL_PROMPTS } from '@/lib/review/initialContent';

const SECTIONS = [
  { key: 's1',  num: 'I',    title: 'Context' },
  { key: 's2',  num: 'II',   title: 'Direction & design principles' },
  { key: 's3',  num: 'III',  title: 'Programme model' },
  { key: 's4',  num: 'IV',   title: 'Workflow' },
  { key: 's5',  num: 'V',    title: 'Geographies & rollout' },
  { key: 's6',  num: 'VI',   title: 'Cost' },
  { key: 's7',  num: 'VII',  title: 'Operational infrastructure' },
  { key: 's8',  num: 'VIII', title: 'Communication & outreach' },
  { key: 's9',  num: 'IX',   title: 'What we are deliberately not doing' },
  { key: 's10', num: 'X',    title: 'Risks & mitigations' },
  { key: 's11', num: 'XI',   title: 'Immediate next steps' },
  { key: 's12', num: 'XII',  title: 'Assumptions & open decisions' },
];

// Key decisions and assumptions surfaced as interactive blocks
const SECTION_BLOCKS: Record<string, Array<{ id: string; type: string; text: string }>> = {
  s5: [
    { id: 'a1', type: 'assumption', text: 'Each Phase 1 geography absorbs 30–50 candidates per year by Year 3. Tested through geo-level needs assessments before each rollout.' },
  ],
  s6: [
    { id: 'a2', type: 'assumption', text: '60% group / 40% individual mix used for cost projection. Real mix follows application quality — higher group share lowers total outlay.' },
  ],
  s7: [
    { id: 'a3', type: 'assumption', text: '1:12–15 handholding ratio is the single biggest operational commitment. If field reality requires 1:8–10, geo headcount roughly doubles.' },
  ],
  s12: [
    { id: 'd1', type: 'decision', text: 'Scale: 1,000 candidates by Year 5 at blended ₹17L/year. Higher scale (2,500+) requires faster geo build and materially higher operational overhead.' },
    { id: 'd2', type: 'decision', text: 'Per-candidate envelope: ₹20L/year individual, ₹15L/year group members. Authority needed to confirm this before Bangalore sourcing opens.' },
    { id: 'd3', type: 'decision', text: '5-year support window per candidate — Year 1 induction, Years 2–5 independent operation with annual continuation reviews. Shorter window increases churn risk.' },
    { id: 's1', type: 'settled', text: 'Bangalore is the pilot. No freshers. Direct funding from day one. Sourcing and screening centralised; seeding and handholding by geo teams.' },
  ],
};

async function seedSeedingNote(): Promise<string> {
  // Ensure core tables exist (idempotent)
  await Promise.all([
    sql`CREATE TABLE IF NOT EXISTS grant_notes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      org_name text NOT NULL DEFAULT '',
      org_city text DEFAULT '',
      meeting text DEFAULT '',
      theme text DEFAULT '',
      grant_number text DEFAULT '',
      grant_amount text DEFAULT '',
      grant_duration text DEFAULT '',
      doc_type text DEFAULT 'grant_note',
      status text DEFAULT 'submitted',
      draft_text text DEFAULT '',
      submitted_by text DEFAULT '',
      updated_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    )`.catch(() => null),
    sql`CREATE TABLE IF NOT EXISTS grant_note_sections (
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
    )`.catch(() => null),
  ]);

  const workflowHtml = WORKFLOW_HTML;
  const costChartHtml = COST_CHART_HTML;

  // Create the note record
  const noteRows = await sql`
    INSERT INTO grant_notes
      (org_name, org_city, meeting, theme, doc_type, status, submitted_by, grant_amount, draft_text)
    VALUES
      ('Seeding Programme', '', 'Leadership Review', 'Capacity Building',
       'programme_design', 'submitted', 'Programme Team', '₹460 Cr / 5 years', '')
    RETURNING id
  `;
  const noteId = (noteRows[0] as any).id as string;

  // Build + insert all sections
  await Promise.all(
    SECTIONS.map((s, i) => {
      let html = INITIAL_CONTENT[s.key] || '';
      // Replace component placeholders with rendered SVG
      html = html.replace(/<div data-component="workflow-diagram"><\/div>/g, workflowHtml);
      html = html.replace(/<div data-component="cost-chart"><\/div>/g, costChartHtml);
      const blocks = SECTION_BLOCKS[s.key] || [];
      const prompt = INITIAL_PROMPTS[s.key] || '';
      return sql`
        INSERT INTO grant_note_sections
          (note_id, section_key, section_num, title, content_html, prompt_text, blocks, sort_order)
        VALUES
          (${noteId}::uuid, ${s.key}, ${s.num}, ${s.title},
           ${html}, ${prompt}, ${JSON.stringify(blocks)}::jsonb, ${i})
      `;
    })
  );

  return noteId;
}

export default async function SeedingRedirect() {
  const rows = await sql`
    SELECT id FROM grant_notes
    WHERE org_name = 'Seeding Programme' AND doc_type = 'programme_design'
    LIMIT 1
  `.catch(() => []);

  let noteId: string;
  if ((rows as any[]).length > 0) {
    noteId = (rows as any[])[0].id;
  } else {
    noteId = await seedSeedingNote();
  }

  redirect(`/notes/${noteId}`);
}
