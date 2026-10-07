/**
 * The no-city flag is stored TWICE on purpose — `notCitySpecific` for queries
 * and chips, the `__NO_CITY__` sentinel in jobSnapshotJson.location.city for
 * the prompt (see lib/recruitment/systemPrompt.ts). They must agree.
 *
 *   npx tsx scripts/check-desk-location-invariant.ts
 *
 * Zero violations is correct. A row here is a HALF-CONVERTED desk, and both
 * halves fail silently: snapshot-only keeps the UI nagging and printing the
 * old city, column-only claims no city while the next Add CVs judges the
 * newcomer against the old one. Run after any conversion work.
 *
 * Read-only. NOTE .env.local points at production.
 */
import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
(async () => {
  const { prisma } = await import("../lib/prisma");
  const rows = await prisma.$queryRaw<any[]>`
    SELECT slug, "locationId", "notCitySpecific",
           "jobSnapshotJson"->'location'->>'city' AS snap_city
    FROM "RecruitmentScoutingDay"
    WHERE ("notCitySpecific" AND COALESCE("jobSnapshotJson"->'location'->>'city','') <> '__NO_CITY__')
       OR (NOT "notCitySpecific" AND "jobSnapshotJson"->'location'->>'city' = '__NO_CITY__')
       OR ("notCitySpecific" AND "locationId" IS NOT NULL)
       OR ("notCitySpecific" AND "jobId" IS NULL)`;
  console.log(`invariant violations: ${rows.length}`);
  for (const r of rows) console.log("  ", r);
  const all = await prisma.$queryRaw<any[]>`
    SELECT slug, "locationId" IS NULL AS no_loc, "notCitySpecific", "locationChangedAt",
           "jobSnapshotJson"->'location'->>'city' AS snap_city
    FROM "RecruitmentScoutingDay" ORDER BY "createdAt" DESC LIMIT 4`;
  console.log("\nnewest desks:");
  for (const r of all) console.log(`  ${r.slug.padEnd(26)} noLoc=${r.no_loc} notCitySpecific=${r.notCitySpecific} changed=${r.locationChangedAt ?? "-"} snap=${r.snap_city}`);
  await prisma.$disconnect();
})().catch((e) => { console.error("ERR:", e); process.exitCode = 1; });
