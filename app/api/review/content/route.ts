import { sql, ok, bad } from '@/lib/review/db';


export async function GET() {
  const rows = await sql`SELECT section_id, content_html, prompt_text FROM section_content`;
  const map: Record<string, { content_html: string; prompt_text: string }> = {};
  for (const row of rows) map[row.section_id] = { content_html: row.content_html, prompt_text: row.prompt_text };
  return ok(map);
}

export async function PATCH(req: Request) {
  const pass = req.headers.get('x-admin-passphrase');
  if (pass !== process.env.ADMIN_PASSPHRASE) return bad('Unauthorized', 401);
  const { section_id, content_html, prompt_text } = await req.json();
  if (!section_id || content_html === undefined) return bad('Missing fields');
  await sql`
    INSERT INTO section_content (section_id, content_html, prompt_text, updated_at)
    VALUES (${section_id}, ${content_html}, ${prompt_text ?? ''}, now())
    ON CONFLICT (section_id) DO UPDATE
    SET content_html = EXCLUDED.content_html,
        prompt_text  = EXCLUDED.prompt_text,
        updated_at   = now()
  `;
  return ok({ ok: true });
}
