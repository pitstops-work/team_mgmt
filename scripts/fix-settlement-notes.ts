/**
 * scripts/fix-settlement-notes.ts
 *
 * After migration 0036 renames SettlementNote.settlement → settlementId,
 * the column currently holds settlement *names* (the old PK).
 * This script finds the matching Settlement.id for each name and rewrites the PK.
 *
 * Safe to re-run. After this script succeeds, the FK constraint can be added:
 *   ALTER TABLE "SettlementNote"
 *     ADD CONSTRAINT "SettlementNote_settlementId_fkey"
 *     FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE;
 *
 * Run: npx tsx scripts/fix-settlement-notes.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Read all notes using raw SQL (Prisma model now expects settlementId = FK)
  const notes = await prisma.$queryRaw<Array<{ settlementId: string; note: string }>>`
    SELECT "settlementId", "note" FROM "SettlementNote"
  `;

  const settlements = await prisma.settlement.findMany({ select: { id: true, name: true } });
  const nameToId = new Map(settlements.map((s) => [s.name.trim().toLowerCase(), s.id]));

  let matched = 0, unmatched: string[] = [];

  for (const n of notes) {
    const rawName = n.settlementId; // still holds the name after the rename
    const sid = nameToId.get(rawName.trim().toLowerCase());

    if (!sid) {
      unmatched.push(rawName);
      continue;
    }

    if (rawName === sid) {
      // Already looks like a cuid — skip
      matched++;
      continue;
    }

    // Delete old row, insert with correct FK id
    await prisma.$executeRaw`DELETE FROM "SettlementNote" WHERE "settlementId" = ${rawName}`;
    await prisma.$executeRaw`
      INSERT INTO "SettlementNote" ("settlementId", "note", "updatedAt")
      VALUES (${sid}, ${n.note}, NOW())
      ON CONFLICT ("settlementId") DO UPDATE SET "note" = EXCLUDED."note"
    `;
    matched++;
  }

  console.log(`Done. Migrated: ${matched}`);
  if (unmatched.length > 0) {
    console.warn(`Unmatched notes (no Settlement found — will be DELETED if you proceed):`);
    for (const u of unmatched) console.warn(`  "${u}"`);
    console.warn(`To clean up: DELETE FROM "SettlementNote" WHERE "settlementId" = ANY(ARRAY[${unmatched.map((u) => `'${u}'`).join(",")}]);`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
