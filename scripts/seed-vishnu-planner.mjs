/**
 * Seeds Vishnu's personal planner blocks for Q1 FY2026 (Apr–Jun 2026).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." USER_EMAIL="your@email.com" node scripts/seed-vishnu-planner.mjs
 *
 * Or set DATABASE_URL in .env.local and just run:
 *   USER_EMAIL="your@email.com" node scripts/seed-vishnu-planner.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load .env.local if present
import { readFileSync } from "fs";
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL not set. Export it or put it in .env.local");
  process.exit(1);
}

const userEmail = process.env.USER_EMAIL;
if (!userEmail) {
  console.error("❌  USER_EMAIL not set. Run: USER_EMAIL=your@email.com node scripts/seed-vishnu-planner.mjs");
  process.exit(1);
}

const { PrismaClient } = require("../app/generated/prisma/index.js");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

// ── Schedule logic ────────────────────────────────────────────────────────────
// Q1 FY2026: Apr 1 – Jun 30, 2026
// Travel pattern: current week (Apr 7–11) is TRAVEL; next week (Apr 14–18) NON-TRAVEL; alternating.
// Travel weeks: Tue–Wed in Chennai → only Thu + Fri available (Mon = BLR team meeting)
// Non-travel weeks: Mon = team meeting → Tue, Wed, Thu, Fri available
//
// Day assignment:
//   Non-travel: Tue = Food/W&S | Wed = Desk work | Thu = Seeding | Fri = Elderly (once/month)
//   Travel:     Thu = Seeding  | Fri = Food/W&S  | (Desk work skipped — only 2 days free)

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon,...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

// First travel week starts Apr 7 (Mon). Non-travel starts Apr 14.
const firstTravelMonday = new Date("2026-04-07");

function isTravelWeek(monday) {
  const diffMs = monday - firstTravelMonday;
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks % 2 === 0; // 0,2,4… are travel weeks
}

const qStart = new Date("2026-04-09"); // today — don't add items in the past
const qEnd   = new Date("2026-07-01");

// Elderly months: pick the last free-Friday of a non-travel week in each month
const elderlyDates = new Set(["2026-04-18", "2026-05-16", "2026-06-13"]);

const items = [];
let monday = mondayOf(qStart);

while (monday < qEnd) {
  const travel = isTravelWeek(monday);

  if (travel) {
    // Thu = Seeding, Fri = Food/W&S
    const thu = addDays(monday, 3);
    const fri = addDays(monday, 4);
    if (thu >= qStart && thu < qEnd)
      items.push({ title: "Seeding programme work", type: "Internal", date: iso(thu) });
    if (fri >= qStart && fri < qEnd)
      items.push({ title: "Food programme / water & sanitation", type: "Internal", date: iso(fri) });
  } else {
    // Tue = Food/W&S, Wed = Desk work, Thu = Seeding, Fri = Elderly (if that date)
    const tue = addDays(monday, 1);
    const wed = addDays(monday, 2);
    const thu = addDays(monday, 3);
    const fri = addDays(monday, 4);
    if (tue >= qStart && tue < qEnd)
      items.push({ title: "Food programme / water & sanitation", type: "Internal", date: iso(tue) });
    if (wed >= qStart && wed < qEnd)
      items.push({ title: "Desk work & internal coordination", type: "Internal", date: iso(wed) });
    if (thu >= qStart && thu < qEnd)
      items.push({ title: "Seeding programme work", type: "Internal", date: iso(thu) });
    if (fri >= qStart && fri < qEnd && elderlyDates.has(iso(fri)))
      items.push({ title: "Elderly programme", type: "Visit", date: iso(fri) });
  }

  monday = addDays(monday, 7);
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function main() {
  const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true, name: true } });
  if (!user) { console.error(`❌  No user found with email: ${userEmail}`); process.exit(1); }
  console.log(`✓  Found user: ${user.name} (${user.id})`);

  console.log(`\n📅  Planning to create ${items.length} plan items:\n`);
  for (const item of items) console.log(`   ${item.date}  [${item.type.padEnd(8)}]  ${item.title}`);

  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question("\nProceed? (y/N) ", ans => { rl.close(); if (ans.toLowerCase() !== "y") { console.log("Aborted."); process.exit(0); } resolve(); }));

  let created = 0;
  for (const item of items) {
    await prisma.planItem.create({
      data: {
        title: item.title,
        type: item.type,
        date: new Date(item.date + "T00:00:00.000Z"),
        userId: user.id,
      },
    });
    process.stdout.write(`\r   Created ${++created}/${items.length}…`);
  }

  console.log(`\n✅  Done — ${created} plan items added for ${user.name}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
