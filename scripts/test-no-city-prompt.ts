/**
 * Prompt assertions for the no-city scouting desk. No DB, no model spend.
 *
 *   npx tsx scripts/test-no-city-prompt.ts [snapshot-dir]
 *
 * Checks two things:
 *
 * 1. All three prompt builders carry the no-city branch — so add-CVs, re-scout
 *    and move inherit it, not just first generation. The axis rule is asserted
 *    only on the builders that CHOOSE axes; append locks them to the original
 *    pool and never calls axesRule.
 * 2. With a snapshot dir, it writes the UNPLACED and normal-city prompts to
 *    disk. Run it, `git stash`, run it again into a second dir and diff: both
 *    must be byte-identical, which is the cheapest proof that a change to this
 *    file did not disturb the two desks already on prod.
 */
import {
  buildSystemPrompt, buildAppendSystemPrompt, buildRegenerateSystemPrompt,
  jobSnapshotNoCity, jobSnapshotUnplaced, jobSnapshotFromRow,
} from "../lib/recruitment/systemPrompt";
import type { RecruitmentJob } from "../app/generated/prisma/client";
import { writeFileSync } from "fs";

const job = {
  id: "j1", slug: "x", title: "Programme Coordinator", seniority: "mid",
  dayToDay: "Coordinate across partners.", mustHaves: ["5 yrs NGO"], niceToHaves: ["Excel"],
  hardDisqualifiers: ["no degree"], salaryBand: "6-8L", theme: "football", notes: "Central team.",
  redFlagRules: [], yellowFlagRules: [], scrutiniseFor: [], lockedAxes: [],
  locationId: "l1", archivedAt: null, createdAt: new Date(), updatedAt: new Date(), createdById: null,
} as unknown as RecruitmentJob;

const city = { city: "Bangalore", state: "Karnataka", country: "IN", primaryLanguage: "Kannada",
  localReferenceOrgs: ["APF"], localRedFlags: ["x"], mobilityDefault: "own-two-wheeler", notes: "Ops heavy." };

// Shared by all three builders.
const MUST = ["not tied to a city", "Make NO assumptions about language", "Location overrides"];
// Only the two builders that actually CHOOSE axes. Append locks them to the
// original pool's axes and never calls axesRule, so asserting it there would
// be asserting a line that cannot exist.
const MUST_PICKING_AXES = ["No axis may measure locality"];
const MUST_NOT = ["NOT YET DETERMINED", "work out where each of these people belongs",
  "relocation friction", '"LOCAL"'];

let bad = 0;
const cases: [string, string, boolean][] = [
  ["buildSystemPrompt", buildSystemPrompt(jobSnapshotNoCity(job)), true],
  ["buildAppendSystemPrompt", buildAppendSystemPrompt(jobSnapshotNoCity(job), ["A","B","C","D","E","F"], []), false],
  ["buildRegenerateSystemPrompt", buildRegenerateSystemPrompt(jobSnapshotNoCity(job)), true],
];
for (const [label, out, picksAxes] of cases) {
  const want = picksAxes ? [...MUST, ...MUST_PICKING_AXES] : MUST;
  const miss = want.filter((m) => !out.includes(m));
  const leak = MUST_NOT.filter((m) => out.includes(m));
  const ok = !miss.length && !leak.length;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (miss.length) console.log(`        missing: ${JSON.stringify(miss)}`);
  if (leak.length) console.log(`        leaked:  ${JSON.stringify(leak)}`);
}

// Snapshots of the two UNCHANGED prompt shapes, for the git-stash comparison.
const dir = process.argv[2];
if (dir) {
  writeFileSync(`${dir}/unplaced.txt`, buildSystemPrompt(jobSnapshotUnplaced(job)));
  writeFileSync(`${dir}/city.txt`, buildSystemPrompt(jobSnapshotFromRow(job, city)));
  writeFileSync(`${dir}/append-city.txt`, buildAppendSystemPrompt(jobSnapshotFromRow(job, city), ["A","B","C","D","E","F"], []));
  console.log(`\nwrote unchanged-prompt snapshots to ${dir}`);
}
process.exitCode = bad ? 1 : 0;
