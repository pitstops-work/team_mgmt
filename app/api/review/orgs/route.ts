import { sql, ok, bad } from '@/lib/review/db';

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
  const rows = await sql`
    SELECT o.id, o.name, o.city, o.created_at,
           COALESCE(d.completed_stages, '{}') as completed_stages
    FROM orgs o
    LEFT JOIN org_due_diligence d ON d.org_id = o.id
    ORDER BY o.name
  `;
  return ok(rows);
}

export async function POST(req: Request) {
  await ensureTables();
  const { name, city } = await req.json();
  if (!name?.trim()) return bad('name required');

  const rows = await sql`
    INSERT INTO orgs (name, city) VALUES (${name.trim()}, ${city?.trim() || ''})
    ON CONFLICT (name) DO UPDATE SET city = EXCLUDED.city, updated_at = now()
    RETURNING id, name, city
  `;
  const org = rows[0];

  await sql`
    INSERT INTO org_due_diligence (org_id) VALUES (${org.id})
    ON CONFLICT (org_id) DO NOTHING
  `;

  return ok(org);
}
