import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

const STAGE_COLS: Record<string, string> = {
  'org-profile':        'org_profile',
  'governing-body':     'governing_body',
  'compliance':         'compliance_check',
  'statutory-filings':  'statutory_filings',
  'salary':             'salary_details',
  'funding':            'funding_income',
  'expenditure':        'expenditure',
  'pdd':                'pdd',
};

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const rows = await sql`
    SELECT o.id, o.name, o.city,
           d.org_profile, d.governing_body, d.compliance_check,
           d.statutory_filings, d.salary_details, d.funding_income,
           d.expenditure, d.pdd, d.completed_stages, d.updated_at
    FROM orgs o
    JOIN org_due_diligence d ON d.org_id = o.id
    WHERE o.id = ${orgId}
  `;
  if (!rows[0]) return bad('not found', 404);
  return ok(rows[0]);
}

export async function PUT(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { stage, data, markComplete } = await req.json();

  const col = STAGE_COLS[stage];
  if (!col) return bad('invalid stage');

  const json = JSON.stringify(data);

  if (col === 'org_profile')       await sql`UPDATE org_due_diligence SET org_profile       = ${json}::jsonb, updated_at = now() WHERE org_id = ${orgId}`;
  else if (col === 'governing_body')    await sql`UPDATE org_due_diligence SET governing_body    = ${json}::jsonb, updated_at = now() WHERE org_id = ${orgId}`;
  else if (col === 'compliance_check')  await sql`UPDATE org_due_diligence SET compliance_check  = ${json}::jsonb, updated_at = now() WHERE org_id = ${orgId}`;
  else if (col === 'statutory_filings') await sql`UPDATE org_due_diligence SET statutory_filings = ${json}::jsonb, updated_at = now() WHERE org_id = ${orgId}`;
  else if (col === 'salary_details')    await sql`UPDATE org_due_diligence SET salary_details    = ${json}::jsonb, updated_at = now() WHERE org_id = ${orgId}`;
  else if (col === 'funding_income')    await sql`UPDATE org_due_diligence SET funding_income    = ${json}::jsonb, updated_at = now() WHERE org_id = ${orgId}`;
  else if (col === 'expenditure')       await sql`UPDATE org_due_diligence SET expenditure       = ${json}::jsonb, updated_at = now() WHERE org_id = ${orgId}`;
  else if (col === 'pdd')               await sql`UPDATE org_due_diligence SET pdd               = ${json}::jsonb, updated_at = now() WHERE org_id = ${orgId}`;

  if (markComplete === true) {
    await sql`UPDATE org_due_diligence SET completed_stages = array_append(array_remove(completed_stages, ${stage}), ${stage}), updated_at = now() WHERE org_id = ${orgId}`;
  } else if (markComplete === false) {
    await sql`UPDATE org_due_diligence SET completed_stages = array_remove(completed_stages, ${stage}), updated_at = now() WHERE org_id = ${orgId}`;
  }

  return ok({ ok: true });
}
