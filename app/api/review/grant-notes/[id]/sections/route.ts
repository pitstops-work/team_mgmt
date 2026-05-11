import { sql, ok, bad } from '@/lib/review/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT section_key, section_num, title, content_html, prompt_text, blocks, sort_order
    FROM grant_note_sections
    WHERE note_id = ${id}::uuid
    ORDER BY sort_order ASC
  `;
  return ok({ sections: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }
  const { section_key, section_num, title, content_html, prompt_text, sort_order } = body;
  if (!section_key || !title) return bad('section_key and title required');
  await sql`
    INSERT INTO grant_note_sections (note_id, section_key, section_num, title, content_html, prompt_text, sort_order, blocks)
    VALUES (${id}::uuid, ${section_key}, ${section_num || ''}, ${title},
            ${content_html || ''}, ${prompt_text || ''}, ${sort_order ?? 99}, '[]'::jsonb)
    ON CONFLICT (note_id, section_key) DO UPDATE
      SET title = ${title}, content_html = ${content_html || ''}, prompt_text = ${prompt_text || ''},
          sort_order = ${sort_order ?? 99}, updated_at = now()
  `;
  return ok({ ok: true });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }
  const { order } = body;
  if (!Array.isArray(order)) return bad('order array required');
  await Promise.all(
    (order as Array<{ section_key: string; sort_order: number; section_num?: string }>).map(item =>
      sql`UPDATE grant_note_sections
          SET sort_order = ${item.sort_order},
              section_num = COALESCE(${item.section_num ?? null}, section_num),
              updated_at = now()
          WHERE note_id = ${id}::uuid AND section_key = ${item.section_key}`
    )
  );
  return ok({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { section_key } = body;
  if (!section_key) return bad('section_key required');

  const ps: Promise<any>[] = [];

  if (body.title !== undefined)
    ps.push(sql`UPDATE grant_note_sections SET title = ${body.title}, updated_at = now() WHERE note_id = ${id}::uuid AND section_key = ${section_key}`);
  if (body.content_html !== undefined)
    ps.push(sql`UPDATE grant_note_sections SET content_html = ${body.content_html}, updated_at = now() WHERE note_id = ${id}::uuid AND section_key = ${section_key}`);
  if (body.prompt_text !== undefined)
    ps.push(sql`UPDATE grant_note_sections SET prompt_text = ${body.prompt_text}, updated_at = now() WHERE note_id = ${id}::uuid AND section_key = ${section_key}`);
  if (body.blocks !== undefined)
    ps.push(sql`UPDATE grant_note_sections SET blocks = ${JSON.stringify(body.blocks)}::jsonb, updated_at = now() WHERE note_id = ${id}::uuid AND section_key = ${section_key}`);

  await Promise.all(ps);
  return ok({ ok: true });
}
