/**
 * Read-only inspection of the Gubbachi note in the review portal DB.
 * Writes the section content_html + diagrams to /tmp/gubbachi-inspect.txt
 * so the exact HTML can be examined.
 *
 * Run:  REVIEW_DATABASE_URL=... npx tsx scripts/inspect-gubabchi-note.ts
 * or:   vercel env pull .env.review --environment=production
 *       REVIEW_DATABASE_URL="$(grep '^REVIEW_DATABASE_URL=' .env.review | cut -d= -f2- | tr -d '\"')" npx tsx scripts/inspect-gubabchi-note.ts
 */
import { neon } from '@neondatabase/serverless';
import { writeFileSync } from 'fs';

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);
  const out: string[] = [];
  const log = (s: string) => { out.push(s); };

  const notes = await sql`SELECT id, org_name, doc_type FROM grant_notes WHERE org_name ILIKE ${'%gubabchi%'} OR org_name ILIKE ${'%gubbachi%'}`;
  log('=== NOTES ===\n' + JSON.stringify(notes, null, 2));

  for (const n of notes as any[]) {
    log(`\n\n########## NOTE ${n.id} (${n.org_name}, ${n.doc_type}) ##########`);

    const secs = await sql`
      SELECT title, sort_order, content_html
      FROM grant_note_sections WHERE note_id = ${n.id}::uuid ORDER BY sort_order`;
    log(`\n(${(secs as any[]).length} sections in DB)`);
    for (const s of secs as any[]) {
      log(`\n----- SECTION [${s.sort_order}] ${s.title} -----`);
      log(s.content_html);
    }

    const meta = await sql`SELECT vitals, diagrams FROM grant_note_metadata WHERE note_id = ${n.id}::uuid`;
    log('\n----- META diagrams -----\n' + JSON.stringify((meta as any[])[0]?.diagrams, null, 2));
  }

  const path = '/tmp/gubbachi-inspect.txt';
  writeFileSync(path, out.join('\n'));
  console.log('Wrote', path, `(${out.join('\n').length} bytes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
