/**
 * Due-diligence org list.
 *
 * `orgs` is the review DB's *mirror* of the shared partner registry, not a
 * registry of its own. It used to be one: `name` is a UNIQUE text column the
 * "+ New org" form typed straight into, which is how this table came to hold
 * "Demo", "Test" and "dmnfbjdkbs" alongside one real grantee while the other
 * eighteen funded partners were absent entirely — and why due diligence had
 * nothing to pre-fill an approval from.
 *
 * POST now takes an `appOrgId` (Org.id) and mirrors that partner through
 * ensureReviewOrg. Name and city are read from the registry; passing them is
 * no longer how a partner comes into existence.
 */

import { sql, ok, bad } from '@/lib/review/db';
import { auth } from '@/lib/auth';
import { ensurePartnerColumns, ensureReviewOrg } from '@/lib/partners/reviewMirror';

export const runtime = 'nodejs';

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS orgs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      city text DEFAULT '',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS org_due_diligence (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      org_profile jsonb DEFAULT '{}',
      governing_body jsonb DEFAULT '[]',
      compliance_check jsonb DEFAULT '{}',
      statutory_filings jsonb DEFAULT '{}',
      salary_details jsonb DEFAULT '{}',
      funding_income jsonb DEFAULT '{}',
      expenditure jsonb DEFAULT '{}',
      pdd jsonb DEFAULT '{}',
      completed_stages text[] DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(org_id)
    )
  `;
}

export async function GET() {
  await ensureTables();
  await ensurePartnerColumns();
  const rows = await sql`
    SELECT o.id, o.name, o.city, o.created_at, o.app_org_id,
           COALESCE(d.completed_stages, '{}') as completed_stages
    FROM orgs o
    LEFT JOIN org_due_diligence d ON d.org_id = o.id
    ORDER BY o.name
  `;
  return ok(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return bad('Unauthorized', 401);

  await ensureTables();
  const body = await req.json().catch(() => ({}));
  const appOrgId = typeof body?.appOrgId === 'string' ? body.appOrgId.trim() : '';
  // Deliberately no free-text fallback: a partner the registry doesn't know is
  // created in the registry (POST /api/partners) and then opened here, so due
  // diligence and the budget portal can never mean different organisations by
  // the same name.
  if (!appOrgId) return bad('appOrgId required — pick a partner from the registry');

  try {
    const org = await ensureReviewOrg(appOrgId);
    return ok(org);
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Could not resolve that partner', 404);
  }
}
