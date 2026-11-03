/** Read-only check that the partner registry is coherent across both DBs. */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.REVIEW_DATABASE_URL!);

  const aliases = await prisma.orgAlias.findMany({
    select: { alias: true, source: true, org: { select: { name: true } } },
    orderBy: { alias: "asc" },
  });
  console.log(`main.OrgAlias: ${aliases.length}`);
  for (const a of aliases.filter((x) => x.source !== "Org.name")) {
    console.log(`  "${a.alias}" → ${a.org.name}  [${a.source}]`);
  }

  const orgs = (await sql`
    SELECT o.name, o.app_org_id, (d.org_id IS NOT NULL) AS has_dd
      FROM orgs o LEFT JOIN org_due_diligence d ON d.org_id = o.id ORDER BY o.name
  `) as any[];
  console.log(`\nreview.orgs: ${orgs.length}`);
  for (const o of orgs) console.log(`  ${o.name.padEnd(12)} app_org_id=${o.app_org_id ?? "NULL"} dd=${o.has_dd}`);

  const notes = (await sql`
    SELECT app_org_id, count(*)::int n FROM grant_notes GROUP BY 1 ORDER BY 2 DESC
  `) as any[];
  const names = new Map(
    (await prisma.org.findMany({ select: { id: true, name: true } })).map((o) => [o.id, o.name]),
  );
  console.log(`\nreview.grant_notes by partner:`);
  for (const r of notes) console.log(`  ${(r.app_org_id ? names.get(r.app_org_id) ?? "??" : "(unlinked)").padEnd(12)} ${r.n}`);

  // Cross-DB coherence: every app_org_id must name a real registry partner.
  const referenced = [...new Set([...orgs, ...notes].map((r: any) => r.app_org_id).filter(Boolean))];
  const dangling = referenced.filter((id) => !names.has(id));
  console.log(`\ndangling app_org_id references: ${dangling.length ? dangling.join(", ") : "none"}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
