import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

export async function GET() {
  const rows = await sql`SELECT key, label, template_rules, export_mode, apply_financial_rules, sort_order FROM doc_types ORDER BY sort_order, key`;
  return ok({ doc_types: rows });
}

export async function PATCH(req: Request) {
  const pass = req.headers.get('x-admin-passphrase');
  if (pass !== process.env.STAFF_PASSPHRASE) return bad('Unauthorized', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { key, label, template_rules, export_mode, apply_financial_rules } = body;
  if (!key) return bad('key required');

  await sql`
    INSERT INTO doc_types (key, label, template_rules, export_mode, apply_financial_rules, updated_at)
    VALUES (${key}, ${label || key}, ${template_rules || ''}, ${export_mode || 'structured'}, ${apply_financial_rules ?? true}, now())
    ON CONFLICT (key) DO UPDATE SET
      label = COALESCE(${label ?? null}, doc_types.label),
      template_rules = COALESCE(${template_rules ?? null}, doc_types.template_rules),
      export_mode = COALESCE(${export_mode ?? null}, doc_types.export_mode),
      apply_financial_rules = COALESCE(${apply_financial_rules ?? null}, doc_types.apply_financial_rules),
      updated_at = now()
  `;
  return ok({ ok: true });
}

export async function POST(req: Request) {
  const pass = req.headers.get('x-admin-passphrase');
  if (pass !== process.env.STAFF_PASSPHRASE) return bad('Unauthorized', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { key, label } = body;
  if (!key || !label) return bad('key and label required');

  await sql`
    INSERT INTO doc_types (key, label, template_rules, export_mode, apply_financial_rules, sort_order)
    VALUES (${key}, ${label}, '', 'structured', true, 99)
    ON CONFLICT (key) DO NOTHING
  `;
  return ok({ ok: true });
}

export async function DELETE(req: Request) {
  const pass = req.headers.get('x-admin-passphrase');
  if (pass !== process.env.STAFF_PASSPHRASE) return bad('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  if (!key) return bad('key required');
  if (['grant_note', 'programme_design'].includes(key)) return bad('cannot delete built-in doc types', 400);

  await sql`DELETE FROM doc_types WHERE key = ${key}`;
  return ok({ ok: true });
}
