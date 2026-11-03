/**
 * One-off: correct "SEIDS" to "SIEDS" in the consortium grant notes.
 *
 * Three notes name the same five-partner Children consortium, two of them
 * spelling SIEDS as "SEIDS". The registry partner is SIEDS; the user confirmed
 * that spelling. This is a correction to the notes' own wording, not a
 * linkage change — a consortium note names five partners and so still has no
 * single owner, and stays unlinked.
 *
 * NOT touched: the same notes spell Janashayog as "Janasahayog". The registry
 * says Janashayog, but nobody has ruled on which is right, and correcting a
 * partner's name on someone's note is not a guess worth making twice.
 *
 * Nothing is deleted. Two of these three notes look like near-duplicate drafts
 * of one note (₹10 Cr vs ₹10.1 Cr, same meeting, same day); deciding that is a
 * separate call, and removing a note is not this script's business.
 *
 * NOTE: .env.local is production. Requires --apply to write.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const WRONG = "SEIDS";
const RIGHT = "SIEDS";

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.REVIEW_DATABASE_URL!);

  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY — writing to production\n" : "DRY RUN — nothing is written\n");

  const rows = (await sql`
    SELECT id, org_name, doc_type, status, created_at, grant_amount
      FROM grant_notes
     WHERE org_name LIKE ${"%" + WRONG + "%"}
     ORDER BY created_at
  `) as { id: string; org_name: string; doc_type: string; status: string; created_at: string; grant_amount: string | null }[];

  if (rows.length === 0) {
    console.log(`  no notes contain "${WRONG}" — nothing to do`);
    return;
  }

  for (const r of rows) {
    const corrected = r.org_name.split(WRONG).join(RIGHT);
    console.log(`  ${apply ? "fixed  " : "would fix"} [${r.doc_type}/${r.status}${r.grant_amount ? `/${r.grant_amount}` : ""}]`);
    console.log(`      "${r.org_name}"`);
    console.log(`   →  "${corrected}"`);
    if (apply) {
      await sql`UPDATE grant_notes SET org_name = ${corrected} WHERE id = ${r.id}`;
    }
  }

  console.log(`\n${apply ? "corrected" : "would correct"} ${rows.length} note(s). They remain unlinked — a consortium note has no single owner.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
