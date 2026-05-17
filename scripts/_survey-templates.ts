import prisma from "../lib/prisma";

async function main() {
  const rows = await prisma.$queryRaw<{
    slug: string;
    name: string;
    category: string;
    domain: string | null;
    n_pitstops: number;
    n_items: bigint;
  }[]>`
    SELECT slug, name, category, "needsDomain" AS domain,
           jsonb_array_length(pitstops) AS n_pitstops,
           (SELECT COUNT(*) FROM jsonb_array_elements(pitstops) pt
            CROSS JOIN jsonb_array_elements(pt->'checklist') ci) AS n_items
    FROM "GoalTemplateDef"
    WHERE "isActive" = true
    ORDER BY category, name
  `;
  console.log("Total active templates:", rows.length);
  const totalItems = rows.reduce((s, r) => s + Number(r.n_items), 0);
  console.log("Total checklist items:", totalItems);
  console.log("");
  for (const r of rows) {
    console.log(
      `${r.category.padEnd(22)} ${r.slug.padEnd(40)} ${String(r.n_pitstops).padStart(2)}p ${String(r.n_items).padStart(3)} items  ${r.domain ?? "-"}`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
