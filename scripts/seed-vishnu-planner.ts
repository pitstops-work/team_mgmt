/**
 * Seeds Vishnu's personal planner blocks for Q1 FY2026 (Apr–Jun 2026).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." USER_EMAIL="your@email.com" npx tsx scripts/seed-vishnu-planner.ts
 */

import { PrismaClient } from "@prisma/client";
import * as readline from "readline";

const userEmail = process.env.USER_EMAIL;
if (!userEmail) {
  console.error("❌  USER_EMAIL not set.");
  console.error("   Run: DATABASE_URL=\"...\" USER_EMAIL=you@email.com npx tsx scripts/seed-vishnu-planner.ts");
  process.exit(1);
}

// ── Schedule ─────────────────────────────────────────────────────────────────
// Q1 FY2026: Apr 9 – Jun 30, 2026
// Travel pattern: fortnightly Chennai Tue–Wed (week of Apr 6 is travel)
//   Travel weeks:     Thu = Seeding  | Fri = Food/W&S
//   Non-travel weeks: Tue = Food/W&S | Wed = Desk work | Thu = Seeding | Fri = Elderly (once/month)

const ITEMS = [
  // Travel week Apr 6–12
  { date: "2026-04-09", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-04-10", title: "Food programme / water & sanitation", type: "Internal" },
  // Non-travel Apr 13–19
  { date: "2026-04-14", title: "Food programme / water & sanitation", type: "Internal" },
  { date: "2026-04-15", title: "Desk work & internal coordination",   type: "Internal" },
  { date: "2026-04-16", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-04-17", title: "Elderly programme",                   type: "Visit"    },
  // Travel Apr 20–26
  { date: "2026-04-23", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-04-24", title: "Food programme / water & sanitation", type: "Internal" },
  // Non-travel Apr 27 – May 3
  { date: "2026-04-28", title: "Food programme / water & sanitation", type: "Internal" },
  { date: "2026-04-29", title: "Desk work & internal coordination",   type: "Internal" },
  { date: "2026-04-30", title: "Seeding programme work",              type: "Internal" },
  // Travel May 4–10
  { date: "2026-05-07", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-05-08", title: "Food programme / water & sanitation", type: "Internal" },
  // Non-travel May 11–17
  { date: "2026-05-12", title: "Food programme / water & sanitation", type: "Internal" },
  { date: "2026-05-13", title: "Desk work & internal coordination",   type: "Internal" },
  { date: "2026-05-14", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-05-15", title: "Elderly programme",                   type: "Visit"    },
  // Travel May 18–24
  { date: "2026-05-21", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-05-22", title: "Food programme / water & sanitation", type: "Internal" },
  // Non-travel May 25–31
  { date: "2026-05-26", title: "Food programme / water & sanitation", type: "Internal" },
  { date: "2026-05-27", title: "Desk work & internal coordination",   type: "Internal" },
  { date: "2026-05-28", title: "Seeding programme work",              type: "Internal" },
  // Travel Jun 1–7
  { date: "2026-06-04", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-06-05", title: "Food programme / water & sanitation", type: "Internal" },
  // Non-travel Jun 8–14
  { date: "2026-06-09", title: "Food programme / water & sanitation", type: "Internal" },
  { date: "2026-06-10", title: "Desk work & internal coordination",   type: "Internal" },
  { date: "2026-06-11", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-06-12", title: "Elderly programme",                   type: "Visit"    },
  // Travel Jun 15–21
  { date: "2026-06-18", title: "Seeding programme work",              type: "Internal" },
  { date: "2026-06-19", title: "Food programme / water & sanitation", type: "Internal" },
  // Non-travel Jun 22–28
  { date: "2026-06-23", title: "Food programme / water & sanitation", type: "Internal" },
  { date: "2026-06-24", title: "Desk work & internal coordination",   type: "Internal" },
  { date: "2026-06-25", title: "Seeding programme work",              type: "Internal" },
] as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function main() {
  const prisma = new PrismaClient();

  const user = await prisma.user.findUnique({
    where: { email: userEmail! },
    select: { id: true, name: true },
  });
  if (!user) {
    console.error(`❌  No user found with email: ${userEmail}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`✓  Found user: ${user.name} (${user.id})\n`);

  const counts: Record<string, number> = {};
  for (const item of ITEMS) {
    const day = DAYS[new Date(item.date + "T12:00:00Z").getUTCDay()];
    console.log(`   ${item.date} (${day})  [${item.type.padEnd(8)}]  ${item.title}`);
    counts[item.title] = (counts[item.title] ?? 0) + 1;
  }
  console.log(`\nSummary:`);
  for (const [title, count] of Object.entries(counts)) {
    console.log(`   ${count}x  ${title}`);
  }
  console.log(`   ──\n   ${ITEMS.length}   total\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => rl.question("Add all to planner? (y/N) ", resolve));
  rl.close();
  if (answer.toLowerCase() !== "y") { console.log("Aborted."); process.exit(0); }

  let created = 0;
  for (const item of ITEMS) {
    await prisma.planItem.create({
      data: {
        title:  item.title,
        type:   item.type,
        date:   new Date(item.date + "T12:00:00Z"),
        userId: user.id,
      },
    });
    process.stdout.write(`\r   Created ${++created}/${ITEMS.length}…`);
  }

  console.log(`\n✅  Done — ${created} plan items added for ${user.name}`);
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  process.exit(1);
});
