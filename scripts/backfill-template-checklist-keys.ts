/**
 * Back-fills `key` on every checklist item across all GoalTemplateDef rows
 * where it is currently missing. Key is derived by slugifying `text`.
 *
 * Idempotent: rows with an existing key are left untouched.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/backfill-template-checklist-keys.ts            # dry run
 *   npx tsx scripts/backfill-template-checklist-keys.ts --apply    # write
 */

import prisma from "../lib/prisma";
import { slugifyChecklistText, type DbPitstop } from "../lib/templateDb";

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.$queryRaw<{ slug: string; name: string; pitstops: unknown }[]>`
    SELECT slug, name, pitstops FROM "GoalTemplateDef"
  `;

  let templatesTouched = 0;
  let itemsTouched = 0;
  let collisions = 0;

  for (const r of rows) {
    const pts = (r.pitstops as DbPitstop[]) ?? [];
    let changed = false;
    const seenKeys = new Set<string>();
    const next = pts.map((pt) => ({
      ...pt,
      checklist: (pt.checklist ?? []).map((item, idx) => {
        const existing = (item.key ?? "").trim();
        if (existing) {
          if (seenKeys.has(existing)) collisions++;
          seenKeys.add(existing);
          return item;
        }
        let base = slugifyChecklistText(item.text) || `item-${idx + 1}`;
        let candidate = base;
        let n = 2;
        while (seenKeys.has(candidate)) {
          collisions++;
          candidate = `${base}-${n++}`;
        }
        seenKeys.add(candidate);
        changed = true;
        itemsTouched++;
        return { ...item, key: candidate };
      }),
    }));
    if (changed) {
      templatesTouched++;
      if (apply) {
        await prisma.$executeRaw`
          UPDATE "GoalTemplateDef"
          SET pitstops = ${JSON.stringify(next)}::jsonb, "updatedAt" = NOW()
          WHERE slug = ${r.slug}
        `;
      }
      console.log(`${apply ? "[updated]" : "[would update]"} ${r.slug}`);
    }
  }

  console.log("");
  console.log(`Templates ${apply ? "updated" : "to update"}: ${templatesTouched}`);
  console.log(`Items ${apply ? "back-filled" : "to back-fill"}: ${itemsTouched}`);
  if (collisions) console.log(`Duplicate-slug collisions resolved with -2, -3 suffixes: ${collisions}`);
  if (!apply) console.log("\nRe-run with --apply to write changes.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
