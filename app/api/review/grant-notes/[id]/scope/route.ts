import { sql, ok, bad } from '@/lib/review/db';
import { defaultCapabilityIdsForDocType } from '@/lib/review/capabilities';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [scopeRows, noteRows, docTypeRows] = await Promise.all([
    sql`SELECT capability_ids, updated_at, updated_by FROM grant_note_scope WHERE note_id = ${id}::uuid`.catch(() => [] as any[]),
    sql`SELECT doc_type FROM grant_notes WHERE id = ${id}::uuid`,
    sql`SELECT key, apply_financial_rules FROM doc_types`.catch(() => [] as any[]),
  ]);

  if (noteRows.length === 0) return bad('note not found', 404);
  const docType = (noteRows[0] as any).doc_type;
  const docTypeRow = (docTypeRows as any[]).find(d => d.key === docType) || { apply_financial_rules: true };
  const fallback = defaultCapabilityIdsForDocType(docTypeRow);

  const scope = (scopeRows as any[])[0];
  return ok({
    capability_ids: scope?.capability_ids || fallback,
    is_default: !scope,
    updated_at: scope?.updated_at || null,
    updated_by: scope?.updated_by || null,
    fallback,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  if (!Array.isArray(body?.capability_ids)) return bad('capability_ids must be an array');
  const ids: string[] = body.capability_ids.map((x: unknown) => String(x)).filter(Boolean);
  const updatedBy: string = typeof body.updated_by === 'string' ? body.updated_by : 'system';

  await sql`
    INSERT INTO grant_note_scope (note_id, capability_ids, updated_by, updated_at)
    VALUES (${id}::uuid, ${ids as any}, ${updatedBy}, now())
    ON CONFLICT (note_id) DO UPDATE
      SET capability_ids = ${ids as any},
          updated_by = ${updatedBy},
          updated_at = now()
  `;

  return ok({ ok: true, capability_ids: ids });
}
