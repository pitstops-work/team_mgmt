/**
 * Migrates hardcoded checklist text from notes into real ChecklistItem rows
 * for Mathew's Elderly Care Programme goal.
 * Run with: npx tsx scripts/migrate-elderly-checklists.ts
 */
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.join(__dirname, "../.env.local") });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

function parseChecklist(notes: string | null): { items: string[]; cleanedNotes: string } {
  if (!notes) return { items: [], cleanedNotes: "" };

  const lines = notes.split("\n");
  const checklistStart = lines.findIndex(l => l.trim().toLowerCase().startsWith("checklist:"));
  if (checklistStart === -1) return { items: [], cleanedNotes: notes.trim() };

  const items: string[] = [];
  const beforeChecklist = lines.slice(0, checklistStart).join("\n").trim();

  for (let i = checklistStart + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("- ")) {
      items.push(line.slice(2).trim());
    }
  }

  return { items, cleanedNotes: beforeChecklist };
}

async function main() {
  const goal = await prisma.goal.findFirst({
    where: { title: { contains: "Elderly Care" }, deletedAt: null },
    include: {
      pitstops: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: { checklistItems: true },
      },
    },
  });

  if (!goal) { console.error("Goal not found"); process.exit(1); }
  console.log(`Goal: ${goal.title}`);
  console.log(`Pitstops: ${goal.pitstops.length}\n`);

  let totalCreated = 0;

  for (const pitstop of goal.pitstops) {
    const { items, cleanedNotes } = parseChecklist(pitstop.notes);

    if (items.length === 0) {
      console.log(`[${pitstop.order}] ${pitstop.title} — no checklist found, skipping`);
      continue;
    }

    if (pitstop.checklistItems.length > 0) {
      console.log(`[${pitstop.order}] ${pitstop.title} — already has ${pitstop.checklistItems.length} items, skipping`);
      continue;
    }

    // Create checklist items
    await prisma.checklistItem.createMany({
      data: items.map((text, i) => ({
        pitstopId: pitstop.id,
        text,
        order: i,
      })),
    });

    // Strip checklist section from notes
    await prisma.pitstop.update({
      where: { id: pitstop.id },
      data: { notes: cleanedNotes || null },
    });

    console.log(`[${pitstop.order}] ${pitstop.title}`);
    items.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
    totalCreated += items.length;
  }

  console.log(`\nDone. Created ${totalCreated} checklist items across ${goal.pitstops.length} pitstops.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
