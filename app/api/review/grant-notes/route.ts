import { sql, ok, bad } from '@/lib/review/db';
import { snapshotVersion } from '@/lib/review/versions';
import { auth } from '@/lib/auth';
import { loadBudgetSnapshot } from '@/lib/review/budget-bridge';

export const runtime = 'nodejs';

async function ensureMetadataTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS grant_note_metadata (
      note_id uuid PRIMARY KEY,
      vitals jsonb DEFAULT '{}',
      diagrams jsonb DEFAULT '[]',
      source_documents jsonb DEFAULT '[]',
      staff_notes text DEFAULT '',
      budget_comparison jsonb
    )
  `;
  // Older deployments may have the table without the budget_comparison column.
  await sql`ALTER TABLE grant_note_metadata ADD COLUMN IF NOT EXISTS budget_comparison jsonb`;
}

export async function GET() {
  const rows = await sql`
    SELECT id, org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration,
           doc_type, status, submitted_by, created_at
    FROM grant_notes
    ORDER BY created_at DESC
  `;
  return ok({ notes: rows });
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const {
    org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration,
    doc_type, draft_text, submitted_by, status,
    source_documents, staff_notes, linked_budget_id, linked_budget_domain,
  } = body;

  if (!org_name?.trim()) return bad('org_name required');

  // draft_text is required for draft path; design path sends source_documents instead
  const hasSourceDocs = Array.isArray(source_documents) && source_documents.length > 0;
  if (!hasSourceDocs && !draft_text?.trim()) return bad('draft_text or source_documents required');

  const validStatuses = ['designing', 'submitted', 'approved', 'rejected'];
  const insertStatus = validStatuses.includes(status) ? status : 'designing';

  const rows = await sql`
    INSERT INTO grant_notes
      (org_name, org_city, meeting, theme, grant_number, grant_amount, grant_duration,
       doc_type, draft_text, submitted_by, status)
    VALUES
      (${org_name}, ${org_city || ''}, ${meeting || ''}, ${theme || ''},
       ${grant_number || ''}, ${grant_amount || ''}, ${grant_duration || ''},
       ${doc_type || 'grant_note'}, ${draft_text || ''}, ${submitted_by || ''}, ${insertStatus})
    RETURNING id
  `;

  const noteId = rows[0].id;

  // Snapshot the linked budget's comparison at create time so the note's
  // deviation table doesn't drift if the budget is later edited. Domain comes
  // from the budget_picker field config on the doc type; falls back to Creche
  // for legacy callers / payloads that pre-date the multi-domain rollout.
  let budgetComparison: unknown = null;
  if (linked_budget_id) {
    try {
      const session = await auth();
      if (session?.user?.id) {
        const domainKey = typeof linked_budget_domain === 'string' && linked_budget_domain.trim()
          ? linked_budget_domain.trim()
          : undefined; // bridge resolves to the budget's first domain
        budgetComparison = await loadBudgetSnapshot(linked_budget_id, session.user.id, domainKey);
      }
    } catch (e: any) {
      // Don't fail note creation if the budget snapshot can't be built —
      // surface the reason in the response and let the user retry from the
      // design page.
      budgetComparison = { error: e?.message || 'budget snapshot failed' };
    }
  }

  if (hasSourceDocs || budgetComparison) {
    await ensureMetadataTable();
    await sql`
      INSERT INTO grant_note_metadata (note_id, source_documents, staff_notes, budget_comparison)
      VALUES (${noteId}::uuid,
              ${JSON.stringify(source_documents || [])}::jsonb,
              ${staff_notes || ''},
              ${budgetComparison ? JSON.stringify(budgetComparison) : null}::jsonb)
      ON CONFLICT (note_id) DO UPDATE
        SET source_documents = ${JSON.stringify(source_documents || [])}::jsonb,
            staff_notes = ${staff_notes || ''},
            budget_comparison = COALESCE(${budgetComparison ? JSON.stringify(budgetComparison) : null}::jsonb, grant_note_metadata.budget_comparison)
    `;
  }

  await snapshotVersion({
    noteId,
    trigger: 'note_created',
    createdBy: submitted_by || 'system',
  });

  return ok({
    id: noteId,
    ingest_doc_urls: hasSourceDocs ? source_documents : [],
  });
}
