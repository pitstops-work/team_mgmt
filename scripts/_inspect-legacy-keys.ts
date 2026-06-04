import prisma from "../lib/prisma";

async function main() {
  const rows = await prisma.$queryRaw<{ templateKey: string; count: bigint }[]>`
    SELECT "templateKey", COUNT(*)::bigint AS count
    FROM "Pitstop"
    WHERE "templateKey" IS NOT NULL
      AND "deletedAt" IS NULL
      AND ("templateKey" ~ '-month-[0-9]+$'
        OR "templateKey" ~ '-week-[0-9]+$'
        OR "templateKey" ~ '-q[0-9]+$')
    GROUP BY "templateKey"
    ORDER BY "templateKey"
  `;
  console.log(`${rows.length} distinct legacy-suffixed templateKeys:\n`);
  for (const r of rows) console.log(`  ${String(r.count).padStart(3)}× ${r.templateKey}`);

  // Also count by total instances affected
  const total = rows.reduce((s, r) => s + Number(r.count), 0);
  console.log(`\nTotal pitstop rows with suffixed templateKey: ${total}`);
}
main().finally(() => prisma.$disconnect());
