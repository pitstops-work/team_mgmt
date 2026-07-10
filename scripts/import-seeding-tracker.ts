/**
 * One-time importer: seeds the Seeding Civil Society Startups portal from the launch
 * tracker workbook. Sheet "3. MASTER CHECKLIST" is the spine; sheets 2/10/11/12
 * seed the funnel, execution arc, partner interface and role definitions.
 *
 * The portal is the living master AFTER this runs, so re-running wipes and
 * reseeds ALL seeding content (incl. members) — pass --confirm to actually do
 * it. Safe on an empty database.
 *
 * Run: set -a && source .env.local && set +a && \
 *      npx tsx scripts/import-seeding-tracker.ts "/path/to/Seeding_..._7.xlsx" --confirm
 */

import ExcelJS from "exceljs";
import prisma from "../lib/prisma";
import { rollupTaskFields } from "../lib/seeding/rollup";
import { DEFAULT_LAUNCH_MILESTONES, defaultMilestoneKeyForPhase } from "../lib/seeding/launchMilestones";
import type { SeedingTaskStatus } from "../app/generated/prisma/client";

const WEEK0 = new Date("2026-06-22T00:00:00.000Z"); // Week 0 kickoff
const LAUNCH_WEEK = 14;

const WORKSTREAM_META: Record<string, { label: string; color: string; order: number }> = {
  A:      { label: "A. Team & Geo Readiness",       color: "#6366f1", order: 1 }, // indigo
  B:      { label: "B. Theme & Sub-Geo Definition", color: "#8b5cf6", order: 2 }, // violet
  C:      { label: "C. Outreach & Funnel (10k)",    color: "#f59e0b", order: 3 }, // amber
  D:      { label: "D. Portal, Application & Selection", color: "#0ea5e9", order: 4 }, // sky
  E:      { label: "E. Post-Selection Design",      color: "#10b981", order: 5 }, // emerald
  LAUNCH: { label: "Launch Gate",                   color: "#f43f5e", order: 6 }, // rose
};

const GEOS = [
  { key: "bangalore_urban", label: "Bangalore Urban", sortOrder: 1 },
  { key: "odisha",          label: "Odisha",          sortOrder: 2 },
  { key: "eastern_up",      label: "Eastern UP",      sortOrder: 3 },
  { key: "north_east",      label: "North East",      sortOrder: 4 },
];

// Curated key dates for the dashboard rail (Read Me anchors + Execution arc).
function milestones(): { label: string; date: Date; kind: string; sortOrder: number }[] {
  const launch = new Date(WEEK0.getTime() + LAUNCH_WEEK * 7 * 86400000);
  const d = (iso: string) => new Date(iso + "T00:00:00.000Z");
  return [
    { label: "Kickoff (Week 0)",          date: WEEK0,           kind: "kickoff",     sortOrder: 1 },
    { label: "Portal launch / call live", date: launch,          kind: "launch",      sortOrder: 2 },
    { label: "Application window closes",  date: d("2026-11-30"), kind: "window",      sortOrder: 3 },
    { label: "100 fellows selected",       date: d("2026-12-31"), kind: "selection",   sortOrder: 4 },
    { label: "All fellows onboarded",      date: d("2027-02-28"), kind: "onboarding",  sortOrder: 5 },
    { label: "Orientation complete",       date: d("2027-03-31"), kind: "orientation", sortOrder: 6 },
    { label: "Proposals to Foundation",    date: d("2027-08-31"), kind: "proposal",    sortOrder: 7 },
    { label: "Registration + compliance",  date: d("2027-10-31"), kind: "registration",sortOrder: 8 },
    { label: "Seed grant begins",          date: d("2027-11-01"), kind: "seed_grant",  sortOrder: 9 },
    { label: "Seed grant close",           date: d("2029-10-31"), kind: "seed_close",  sortOrder: 10 },
  ];
}

/** exceljs cell value → trimmed string ("" if empty; unwraps formula results). */
function cs(cell: ExcelJS.Cell): string {
  let v: unknown = cell.value;
  if (v && typeof v === "object" && "result" in (v as object)) v = (v as { result: unknown }).result;
  if (v && typeof v === "object" && "text" in (v as object)) v = (v as { text: unknown }).text; // rich text
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function workstreamKey(cellVal: string): string | null {
  const s = cellVal.trim();
  if (/^A\./.test(s)) return "A";
  if (/^B\./.test(s)) return "B";
  if (/^C\./.test(s)) return "C";
  if (/^D\./.test(s)) return "D";
  if (/^E\./.test(s)) return "E";
  if (/^LAUNCH/i.test(s)) return "LAUNCH";
  return null;
}

function parseWeek(s: string): number | null {
  const m = s.match(/W(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function statusEnum(s: string): "not_started" | "in_progress" | "blocked" | "done" {
  const t = s.toLowerCase();
  if (t.includes("done")) return "done";
  if (t.includes("progress")) return "in_progress";
  if (t.includes("block")) return "blocked";
  return "not_started";
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--")) ??
    "/Users/vishnuharikumar/Downloads/Seeding_Fellowships_Launch_Tracker_7.xlsx";
  const confirm = args.includes("--confirm");

  const existing = await prisma.seedingTask.count().catch(() => 0);
  if (existing > 0 && !confirm) {
    console.error(`Refusing: ${existing} seeding tasks already exist. Re-run with --confirm to wipe & reseed.`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  // ── wipe checklist + reference (idempotent reseed). PRESERVE geos, funnel
  //    actuals, members and config — those are user data, not from the sheet. ─
  await prisma.seedingSubtask.deleteMany();
  await prisma.seedingTask.deleteMany();
  await prisma.seedingPhase.deleteMany();
  await prisma.seedingWorkstream.deleteMany();
  await prisma.seedingMilestone.deleteMany();
  await prisma.seedingRoleDef.deleteMany();
  await prisma.seedingExecPhase.deleteMany();
  await prisma.seedingPartnerInterface.deleteMany();

  // ── config + geos + milestones + funnel ───────────────────────────────────
  await prisma.seedingConfig.upsert({
    where: { id: 1 },
    create: { id: 1, week0Date: WEEK0, launchWeek: LAUNCH_WEEK },
    update: { week0Date: WEEK0, launchWeek: LAUNCH_WEEK },
  });
  await prisma.seedingFunnelConfig.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  // Upsert geos by key (preserve ids so funnel actuals + members survive reseed).
  const geoByKey: Record<string, string> = {};
  for (const g of GEOS) {
    const row = await prisma.seedingGeo.upsert({
      where: { key: g.key },
      create: g,
      update: { label: g.label, sortOrder: g.sortOrder },
    });
    geoByKey[g.key] = row.id;
    const fg = await prisma.seedingFunnelGeo.findUnique({ where: { geoId: row.id } });
    if (!fg) await prisma.seedingFunnelGeo.create({ data: { geoId: row.id } });
  }

  await prisma.seedingMilestone.createMany({ data: milestones() });

  // ── workstreams ───────────────────────────────────────────────────────────
  const wsByKey: Record<string, string> = {};
  for (const [key, m] of Object.entries(WORKSTREAM_META)) {
    const row = await prisma.seedingWorkstream.create({
      data: { key, label: m.label, color: m.color, sortOrder: m.order },
    });
    wsByKey[key] = row.id;
  }

  // ── curated Road-to-Launch milestones (upsert by key; preserve edits) ──────
  const milestoneIdByKey: Record<string, string> = {};
  for (let i = 0; i < DEFAULT_LAUNCH_MILESTONES.length; i++) {
    const d = DEFAULT_LAUNCH_MILESTONES[i];
    const row = await prisma.seedingLaunchMilestone.upsert({
      where: { key: d.key },
      create: { key: d.key, title: d.title, sortOrder: i + 1 },
      update: {}, // preserve any in-app renames / reordering
    });
    milestoneIdByKey[d.key] = row.id;
  }

  // ── master checklist → phases + tasks + sub-tasks ─────────────────────────
  // Col D "Task" is the real task; consecutive rows with the same (workstream,
  // phase, Task) are its sub-tasks (col E), each with its own owner/week/status.
  const ws = wb.getWorksheet("3. MASTER CHECKLIST")!;
  const phaseId: Record<string, string> = {};       // `${wsKey}::${phaseLabel}` → id
  const phaseOrder: Record<string, number> = {};
  type SubRow = { code: string | null; title: string; ownerRole: string | null; supportRoles: string | null; startWeek: number | null; dueWeek: number | null; dependsOn: string | null; doneMetric: string | null; status: SeedingTaskStatus; notes: string | null };
  type Group = { wid: string; pid: string | null; title: string; code: string | null; subs: SubRow[] };
  const groups = new Map<string, Group>();
  const order: string[] = [];

  for (let r = 5; r <= ws.rowCount; r++) {
    const wsKey = workstreamKey(cs(ws.getCell(r, 2)));
    if (!wsKey) continue;
    const wid = wsByKey[wsKey];

    const phaseLabel = cs(ws.getCell(r, 3));
    let pid: string | null = null;
    if (phaseLabel) {
      const pk = `${wsKey}::${phaseLabel}`;
      if (!phaseId[pk]) {
        phaseOrder[wsKey] = (phaseOrder[wsKey] ?? 0) + 1;
        const mKey = defaultMilestoneKeyForPhase(phaseLabel);
        const p = await prisma.seedingPhase.create({
          data: { workstreamId: wid, label: phaseLabel, sortOrder: phaseOrder[wsKey], milestoneId: mKey ? milestoneIdByKey[mKey] ?? null : null },
        });
        phaseId[pk] = p.id;
      }
      pid = phaseId[pk];
    }

    const taskTitle = cs(ws.getCell(r, 4));
    if (!taskTitle) continue;
    const subText = cs(ws.getCell(r, 5));
    const code = cs(ws.getCell(r, 1)) || null;

    const gk = `${wsKey}||${phaseLabel}||${taskTitle}`;
    if (!groups.has(gk)) { groups.set(gk, { wid, pid, title: taskTitle, code, subs: [] }); order.push(gk); }
    groups.get(gk)!.subs.push({
      code,
      title: subText || taskTitle,
      ownerRole: cs(ws.getCell(r, 6)) || null,
      supportRoles: cs(ws.getCell(r, 7)) || null,
      startWeek: parseWeek(cs(ws.getCell(r, 8))),
      dueWeek: parseWeek(cs(ws.getCell(r, 9))),
      dependsOn: cs(ws.getCell(r, 10)) || null,
      doneMetric: cs(ws.getCell(r, 11)) || null,
      status: statusEnum(cs(ws.getCell(r, 12))),
      notes: cs(ws.getCell(r, 13)) || null,
    });
  }

  let taskCount = 0, subCount = 0;
  for (const gk of order) {
    const g = groups.get(gk)!;
    const roll = rollupTaskFields(g.subs);
    const task = await prisma.seedingTask.create({
      data: {
        workstreamId: g.wid, phaseId: g.pid, code: g.code, title: g.title,
        ownerRole: roll.ownerRole, supportRoles: roll.supportRoles,
        startWeek: roll.startWeek, dueWeek: roll.dueWeek, status: roll.status,
        sortOrder: ++taskCount,
      },
    });
    await prisma.seedingSubtask.createMany({
      data: g.subs.map((s, i) => ({ taskId: task.id, sortOrder: i + 1, ...s })),
    });
    subCount += g.subs.length;
  }

  // ── reference: roles (sheet 12) ───────────────────────────────────────────
  const rl = wb.getWorksheet("12. Roles & Responsibilities")!;
  let ro = 0;
  for (let r = 5; r <= rl.rowCount; r++) {
    const role = cs(rl.getCell(r, 1));
    if (!role || role.toLowerCase() === "note") continue;
    await prisma.seedingRoleDef.create({
      data: {
        role,
        newHire: cs(rl.getCell(r, 2)) || null,
        reportsTo: cs(rl.getCell(r, 3)) || null,
        count: cs(rl.getCell(r, 4)) || null,
        coreResponsibility: cs(rl.getCell(r, 5)) || null,
        ownsWorkstreams: cs(rl.getCell(r, 6)) || null,
        inPlaceBy: cs(rl.getCell(r, 7)) || null,
        sortOrder: ++ro,
      },
    });
  }

  // ── reference: fellowship execution (sheet 10) ────────────────────────────
  const ex = wb.getWorksheet("10. Fellowship Execution")!;
  const qHeaders: string[] = [];
  for (let c = 6; c <= ex.columnCount; c++) qHeaders.push(cs(ex.getCell(4, c)));
  let eo = 0;
  for (let r = 5; r <= ex.rowCount; r++) {
    const phase = cs(ex.getCell(r, 2));
    const code = cs(ex.getCell(r, 1));
    if (!phase || phase.toLowerCase() === "note") continue;
    // span of marked quarter columns → "Q4'26 – Q1'27"
    const marked: string[] = [];
    for (let c = 6; c <= ex.columnCount; c++) {
      if (cs(ex.getCell(r, c))) marked.push(qHeaders[c - 6]);
    }
    const quarters = marked.length ? `${marked[0]} – ${marked[marked.length - 1]}` : null;
    await prisma.seedingExecPhase.create({
      data: {
        code: code || null,
        phase,
        window: cs(ex.getCell(r, 3)) || null,
        activities: cs(ex.getCell(r, 4)) || null,
        milestones: cs(ex.getCell(r, 5)) || null,
        quarters,
        sortOrder: ++eo,
      },
    });
  }

  // ── reference: partner–SPOC interface (sheet 11) ──────────────────────────
  const pi = wb.getWorksheet("11. Partner–SPOC Interface")!;
  // section boundaries by the numbered header rows in column A
  let section = "";
  let po = 0;
  for (let r = 4; r <= pi.rowCount; r++) {
    const a = cs(pi.getCell(r, 1));
    if (/^1\./.test(a)) { section = "provides"; continue; }
    if (/^2\./.test(a)) { section = "spoc"; continue; }
    if (/^3\./.test(a)) { section = "cadence"; continue; }
    if (!section) continue;
    const cells = [1, 2, 3, 4, 5].map((c) => cs(pi.getCell(r, c)));
    if (cells.every((x) => !x)) continue;
    await prisma.seedingPartnerInterface.create({
      data: {
        section,
        colA: cells[0] || null, colB: cells[1] || null, colC: cells[2] || null,
        colD: cells[3] || null, colE: cells[4] || null,
        sortOrder: ++po,
      },
    });
  }

  // ── report ────────────────────────────────────────────────────────────────
  const [wc, pc, tc, stc, mc, rc, ec, pic] = await Promise.all([
    prisma.seedingWorkstream.count(), prisma.seedingPhase.count(), prisma.seedingTask.count(),
    prisma.seedingSubtask.count(), prisma.seedingMilestone.count(), prisma.seedingRoleDef.count(),
    prisma.seedingExecPhase.count(), prisma.seedingPartnerInterface.count(),
  ]);
  console.log("Seeded:", { workstreams: wc, phases: pc, tasks: tc, subtasks: stc, geos: GEOS.length, milestones: mc, roleDefs: rc, execPhases: ec, partnerRows: pic });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
