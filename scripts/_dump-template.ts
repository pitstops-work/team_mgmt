import prisma from "../lib/prisma";

async function main() {
  const slug = process.argv[2];
  if (!slug) { console.error("Usage: tsx scripts/_dump-template.ts <slug>"); process.exit(1); }

  const rows = await prisma.$queryRaw<{ name: string; domain: string | null; pitstops: any }[]>`
    SELECT name, "needsDomain" AS domain, pitstops
    FROM "GoalTemplateDef" WHERE slug = ${slug} LIMIT 1
  `;
  const t = rows[0];
  if (!t) { console.error("Not found:", slug); process.exit(1); }

  console.log(`# ${t.name} (${slug})`);
  console.log(`Domain: ${t.domain ?? "-"}`);
  console.log("");
  for (const pt of t.pitstops as any[]) {
    console.log(`## Pitstop: ${pt.title}  [${pt.type}, ${pt.recurrence ?? "None"}, SLA ${pt.slaDays}d]`);
    if (pt.notes) console.log(`  notes: ${pt.notes.slice(0, 300)}${pt.notes.length > 300 ? "…" : ""}`);
    for (const ci of pt.checklist ?? []) {
      const key = ci.key ?? "(no-key)";
      console.log(`  - [${key}] ${ci.text}`);
      for (const a of ci.activities ?? []) {
        console.log(`      · ${a.title} (${a.completionType})`);
      }
    }
    console.log("");
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
