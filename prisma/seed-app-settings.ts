// Seed scheduling configuration into AppSetting.
// Run with: npx ts-node --project tsconfig.json prisma/seed-app-settings.ts
//
// Rules encoded here:
//   - 2026-05-04 is a known travel-week Monday (anchor for alternating travel/non-travel)
//   - Bangalore: non-travel Mondays are blocked (team meeting day)
//   - Chennai:   travel Tuesdays are blocked (team meeting day)
//   - Activities default to 9am local time

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const settings: { key: string; value: string }[] = [
  { key: "travelWeekAnchor", value: "2026-05-04" },
  { key: "activityHour",     value: "9" },
  // non-travel:1 → non-travel week, Monday (JS getDay() = 1)
  { key: "meetingRule:Bangalore", value: "non-travel:1" },
  // travel:2 → travel week, Tuesday (JS getDay() = 2)
  { key: "meetingRule:Chennai",   value: "travel:2" },
];

async function main() {
  for (const s of settings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      create: s,
      update: { value: s.value },
    });
    console.log(`upserted AppSetting: ${s.key} = ${s.value}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
