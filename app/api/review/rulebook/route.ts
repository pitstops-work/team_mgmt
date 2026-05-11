import { sql, ok, bad } from '@/lib/review/db';
import {
  DEFAULT_FINANCIAL_RULES, DEFAULT_LANGUAGE_RULES,
  DEFAULT_TEMPLATE_RULES, DEFAULT_COST_NORMS,
} from '@/lib/review/rulebook';

export const runtime = 'nodejs';

const DEFAULTS: Record<string, string> = {
  financial: DEFAULT_FINANCIAL_RULES,
  language: DEFAULT_LANGUAGE_RULES,
  template: DEFAULT_TEMPLATE_RULES,
  cost_norms: DEFAULT_COST_NORMS,
};

export async function GET() {
  const rows = await sql`SELECT section, content FROM rulebook_rules`;
  const result: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) result[row.section as string] = row.content as string;
  return ok(result);
}

export async function PATCH(req: Request) {
  const pass = req.headers.get('x-admin-passphrase');
  if (pass !== process.env.ADMIN_PASSPHRASE) return bad('Unauthorized', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { section, content } = body;
  if (!['financial', 'language', 'template', 'cost_norms'].includes(section)) return bad('invalid section');

  if (content === null) {
    // Reset to default — delete the override
    await sql`DELETE FROM rulebook_rules WHERE section = ${section}`;
  } else {
    await sql`
      INSERT INTO rulebook_rules (section, content, updated_at)
      VALUES (${section}, ${content}, now())
      ON CONFLICT (section) DO UPDATE SET content = EXCLUDED.content, updated_at = now()
    `;
  }

  return ok({ ok: true });
}
