/**
 * Read-only inspection of the Gubabchi note in the review portal DB.
 * Prints section content_html, diagram definitions, and source-file references
 * so we can see why the export flattens tables and how the "drawings" are stored.
 *
 * Run:  REVIEW_DATABASE_URL=... npx tsx scripts/inspect-gubabchi-note.ts
 */
import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);

  const notes = await sql`SELECT id, org_name, doc_type FROM grant_notes WHERE org_name ILIKE ${'%gubabchi%'} OR org_name ILIKE ${'%gubbachi%'}`;
  console.log('=== NOTES ===');
  console.dir(notes, { depth: null });

  for (const n of notes as any[]) {
    console.log(`\n\n########## NOTE ${n.id} (${n.org_name}, ${n.doc_type}) ##########`);

    const secs = await sql`
      SELECT title, sort_order, content_html
      FROM grant_note_sections WHERE note_id = ${n.id}::uuid ORDER BY sort_order`;
    for (const s of secs as any[]) {
      console.log(`\n----- SECTION [${s.sort_order}] ${s.title} -----`);
      console.log(s.content_html);
    }

    const meta = await sql`SELECT vitals, diagrams FROM grant_note_metadata WHERE note_id = ${n.id}::uuid`;
    console.log('\n----- META diagrams -----');
    console.dir((meta as any[])[0]?.diagrams, { depth: null });

    // source files, if such a table exists
    try {
      const files = await sql`SELECT filename, mime_type, length(extracted_text) AS text_len FROM grant_note_files WHERE note_id = ${n.id}::uuid`;
      console.log('\n----- SOURCE FILES -----');
      console.dir(files, { depth: null });
    } catch (e) {
      console.log('\n(no grant_note_files table / different name)');
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
