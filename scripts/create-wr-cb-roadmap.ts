/**
 * Create the WR & CB vertical roadmap goals from MoM 2026-06-05.
 *
 * 5 goals, 11 pitstops, 28 activities. Owner = Malarvizhi M.
 * Idempotent by title — re-runs skip goals/pitstops/activities that already exist.
 *
 * Usage:
 *   npx tsx scripts/create-wr-cb-roadmap.ts          # dry run
 *   npx tsx scripts/create-wr-cb-roadmap.ts --apply  # write to DB
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const MALAR_NAME_PREFIX = "Malar";

// Activities default to 10:00 IST on their due date.
function ist10am(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T10:00:00+05:30`);
}

type Activity = {
  title: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
};

type Pitstop = {
  title: string;
  description?: string;
  targetDate: string;
  activities: Activity[];
};

type Goal = {
  title: string;
  description: string;
  targetDate: string;
  pitstops: Pitstop[];
};

const MOM_REF = "Source: MoM Welfare Rights & Capacity Building, 2026-06-05.";

const GOALS: Goal[] = [
  {
    title: "WEC — Workers' Entitlements roadmap",
    description:
      "Build the eligibility logic, classification buckets and application flow charts for each of the 4 schemes and all sub-schemes. This is the entitlements reference layer that the CO mobile app will use to route households. Standard output: process document, training module(s) and indicators/metrics — structured to map onto CO mobile workflows. Anchor: Malar. Committee: WEC (Workers' Entitlements Committee). " +
      MOM_REF,
    targetDate: "2026-07-17",
    pitstops: [
      {
        title: "Workers' Entitlements (4 schemes + sub-schemes)",
        description:
          "Deliverables: (a) eligibility criteria for each of the 4 schemes + every sub-scheme, (b) bucketing logic, (c) application flow chart per scheme and per sub-scheme — step-by-step with document checklist and decision points. Feeds into the app scheme registry, eligibility engine and CO app flows.",
        targetDate: "2026-07-17",
        activities: [
          {
            title: "1.1 Finalise list of 4 schemes + all sub-schemes (owner: Malar) — Week 1",
            description: "Confirm the final list of the 4 schemes and enumerate all sub-schemes under each. Feeds into app scheme registry.",
            dueDate: "2026-06-12",
          },
          {
            title: "1.2 Draft eligibility + bucketing per scheme/sub-scheme (owner: WEC) — Weeks 2–4",
            description: "Draft eligibility criteria + bucketing rules for each scheme/sub-scheme. Feeds into the app eligibility engine.",
            dueDate: "2026-07-03",
          },
          {
            title: "1.3 Application flow chart per scheme/sub-scheme (owner: WEC) — Weeks 3–5",
            description: "Produce application flow chart per scheme/sub-scheme including document checklist. Feeds into CO app flows.",
            dueDate: "2026-07-10",
          },
          {
            title: "1.4 Review & sign-off against entitlements standard (owner: Malar) — Week 6",
            description: "Final review and sign-off of WEC deliverables against the entitlements standard.",
            dueDate: "2026-07-17",
          },
        ],
      },
    ],
  },
  {
    title: "CRC — Community Rights roadmap (Collectivisation, General Schemes, GBV, GR, Land Rights)",
    description:
      "Cover the five Community Rights work-streams: 2A Collectivisation, 2B General Schemes (4 schemes), 2C Gender-Based Violence, 2D Grievance Redressal, 2E Land Rights. Standard output for every work-stream: process document, training module(s), indicators/metrics — feeding directly into the CO mobile app. Anchor: Malar. Committee: CRC (Community Rights Committee). " +
      MOM_REF,
    targetDate: "2026-07-31",
    pitstops: [
      {
        title: "2A Collectivisation — process, indicators, training",
        description:
          "Stepwise process document (each step explicitly defined), activity list mapped to each step, indicators per step/activity including a maturity assessment rubric (staged maturity of the collective), and a training module for each step and each activity.",
        targetDate: "2026-07-31",
        activities: [
          {
            title: "2A.1 Stepwise collectivisation process doc + activity list (owners: Malar + CRC) — Weeks 1–3",
            description: "Draft stepwise collectivisation process document with each step explicitly defined and an activity list mapped to each step. Feeds into CO app process flow.",
            dueDate: "2026-06-26",
          },
          {
            title: "2A.2 Indicators per step/activity + maturity rubric (owner: CRC) — Weeks 3–5",
            description: "Define indicators per step/activity plus a staged maturity assessment rubric for the collective. Feeds into the app metrics layer.",
            dueDate: "2026-07-10",
          },
          {
            title: "2A.3 Training module per step and activity (owner: Malar/CB) — Weeks 4–8",
            description: "Build a training module for each collectivisation step and each activity. Feeds into the CB plan and the CO app.",
            dueDate: "2026-07-31",
          },
        ],
      },
      {
        title: "2B General Schemes (4 schemes) — eligibility, buckets, flow charts",
        description: "Same structure as Workers' Entitlements: eligibility, bucketing and application flow charts for each of the 4 general schemes. Feeds into the app eligibility engine and CO app flows.",
        targetDate: "2026-07-10",
        activities: [
          {
            title: "2B.1 Eligibility + bucketing for 4 general schemes (owner: CRC) — Weeks 2–4",
            description: "Draft eligibility criteria + bucketing rules for each of the 4 general schemes. Feeds into app eligibility engine.",
            dueDate: "2026-07-03",
          },
          {
            title: "2B.2 Application flow chart per general scheme (owner: CRC) — Weeks 3–5",
            description: "Produce application flow chart per general scheme. Feeds into CO app flows.",
            dueDate: "2026-07-10",
          },
        ],
      },
      {
        title: "2C GBV — activity set + indicators",
        description: "Define the activity set (referral, support, follow-up protocols) and the indicators for the Gender-Based Violence work-stream.",
        targetDate: "2026-07-17",
        activities: [
          {
            title: "2C.1 Define GBV activity set — referral, support, follow-up (owners: Malar + CRC) — Weeks 2–5",
            description: "Define GBV activity set covering referral, support and follow-up protocols. Feeds into CO app flows.",
            dueDate: "2026-07-10",
          },
          {
            title: "2C.2 Define GBV indicators (owner: CRC) — Weeks 4–6",
            description: "Define GBV indicators. Feeds into the app metrics layer.",
            dueDate: "2026-07-17",
          },
        ],
      },
      {
        title: "2D Grievance Redressal — loop into collectivisation, indicators, training",
        description: "Grievance redressal feeds back into the collectivisation steps and activities. It needs its own indicators and a separate set of training modules.",
        targetDate: "2026-07-31",
        activities: [
          {
            title: "2D.1 Map GR loop into collectivisation steps/activities (owner: CRC) — Weeks 3–5",
            description: "Map the grievance redressal loop into collectivisation steps and activities. Feeds into the 2A collectivisation process.",
            dueDate: "2026-07-10",
          },
          {
            title: "2D.2 Grievance redressal indicators (owner: CRC) — Weeks 4–6",
            description: "Define grievance redressal indicators. Feeds into the app metrics layer.",
            dueDate: "2026-07-17",
          },
          {
            title: "2D.3 Grievance redressal training modules (owner: Malar/CB) — Weeks 5–8",
            description: "Build a separate set of training modules for grievance redressal. Feeds into CB plan and the CO app.",
            dueDate: "2026-07-31",
          },
        ],
      },
      {
        title: "2E Land Rights — process, training, indicators",
        description: "Process document, training module and indicators for the Land Rights work-stream.",
        targetDate: "2026-07-31",
        activities: [
          {
            title: "2E.1 Land rights process document (owner: CRC) — Weeks 2–5",
            description: "Draft the land rights process document. Feeds into CO app process flow.",
            dueDate: "2026-07-10",
          },
          {
            title: "2E.2 Land rights training module (owners: Malar/CB + Moorthy) — Weeks 5–8",
            description: "Build the land rights training module. Feeds into CB plan and CO app.",
            dueDate: "2026-07-31",
          },
          {
            title: "2E.3 Land rights indicators (owner: CRC) — Weeks 4–6",
            description: "Define the land rights indicators. Feeds into the app metrics layer.",
            dueDate: "2026-07-17",
          },
        ],
      },
    ],
  },
  {
    title: "HC — Health (PHC / ARS / MAS) roadmap",
    description:
      "Produce a process document for the planned activities and the corresponding indicators across Primary Health Centre (PHC) linkage, ARS, and Mahila Arogya Samiti (MAS). Standard output: process document + indicators/metrics, structured for the CO mobile app. Anchor: Malar. Committee: HC (Health Committee). " +
      MOM_REF,
    targetDate: "2026-07-24",
    pitstops: [
      {
        title: "Health (PHC / ARS / MAS) — process doc + indicators",
        description: "Process document covering planned activities across PHC linkage, ARS and Mahila Arogya Samiti, plus indicators for each. Feeds into CO app process flow and the app metrics layer.",
        targetDate: "2026-07-24",
        activities: [
          {
            title: "3.1 Process document — PHC / ARS / MAS (owner: HC) — Weeks 2–5",
            description: "Draft the process document for the planned activities across PHC linkage, ARS and MAS. Feeds into CO app process flow.",
            dueDate: "2026-07-10",
          },
          {
            title: "3.2 Define indicators — PHC, ARS, MAS (owner: HC) — Weeks 4–6",
            description: "Define indicators for each of PHC, ARS and MAS. Feeds into the app metrics layer.",
            dueDate: "2026-07-17",
          },
          {
            title: "3.3 Review & sign-off (owner: Malar) — Week 7",
            description: "Final review and sign-off on Health deliverables.",
            dueDate: "2026-07-24",
          },
        ],
      },
    ],
  },
  {
    title: "Capacity Building consolidated plan (month / quarter / year)",
    description:
      "Malar to consolidate CB requirements from all verticals into a single plan covering regular (refresher) trainings and new-batch trainings, with validated costing. New-batch design: Children — 8-week programme, 3 days/week training + 3 days/week apprenticeship in existing children centres. Youth — 20 days of training spread across 3 months. Welfare Rights — few new batches, refresher training of 3 days once per quarter. Output: consolidated CB calendar on SharePoint + costing. " +
      MOM_REF,
    targetDate: "2026-07-31",
    pitstops: [
      {
        title: "CB plan — collect requests, consolidate, design new-batch curricula",
        description: "Collect CB requests across verticals, build the consolidated CB calendar (monthly/quarterly/annual) with validated costing, and detail new-batch curricula for Children and Youth plus the WR quarterly refresher.",
        targetDate: "2026-07-31",
        activities: [
          {
            title: "4.1 Collect CB requests from all verticals (owner: Malar) — Weeks 1–2",
            description: "Collect CB requests from every vertical. Feeds into the consolidated CB plan.",
            dueDate: "2026-06-19",
          },
          {
            title: "4.2 Consolidated CB plan (month/quarter/year) + costing (owner: Malar) — Weeks 2–4",
            description: "Build consolidated CB plan covering monthly, quarterly and annual cadences and validate costing. SharePoint hosted. Feeds into budget/planning.",
            dueDate: "2026-07-03",
          },
          {
            title: "4.3 Children new-batch curriculum (3+3 over 8 weeks) + apprenticeship slots (owners: Thangam + Malar + Umesh/Padma) — Weeks 3–5",
            description: "Detail the Children new-batch curriculum (3 days/week training + 3 days/week apprenticeship in existing children centres) over 8 weeks, plus apprenticeship slot allocation.",
            dueDate: "2026-07-10",
          },
          {
            title: "4.4 Youth 20-day / 3-month schedule (owners: Arul + Malar) — Weeks 3–5",
            description: "Detail the Youth 20-day training schedule spread across 3 months.",
            dueDate: "2026-07-10",
          },
          {
            title: "4.5 WR quarterly 3-day refresher schedule (owner: Malar) — Week 4",
            description: "Schedule the Welfare Rights quarterly 3-day refresher training.",
            dueDate: "2026-07-03",
          },
        ],
      },
    ],
  },
  {
    title: "Programme oversight & handover (resourcing, tracker, Chennai)",
    description:
      "Cross-cutting oversight items from the MoM: (5) Resourcing risk — additional resourcing likely needed in Welfare Rights and Children, surface early into planning/budget; (6) Maintain master tracker of all modules/process docs/indicators by vertical and hand finalised artefacts to the app team within 2–3 months; (7) Run a session with the Chennai team on Children work within the month. Anchor: Malar. " +
      MOM_REF,
    targetDate: "2026-09-04",
    pitstops: [
      {
        title: "Resourcing assessment — WR + Children",
        description: "Assess and quantify additional resourcing need in Welfare Rights and Children; raise into the planning cycle.",
        targetDate: "2026-09-04",
        activities: [
          {
            title: "5.1 Assess + quantify resourcing gaps in WR and Children (owners: Malar + relevant ZLs/PMs + RPs) — within 3 months",
            description: "Assess additional resourcing need in WR and Children; quantify gaps. Feeds into resourcing/budget planning.",
            dueDate: "2026-09-04",
          },
          {
            title: "5.2 Raise resourcing asks into planning cycle (owner: Malar) — end of Q3",
            description: "Raise resourcing asks into the planning cycle for leadership review.",
            dueDate: "2026-09-04",
          },
        ],
      },
      {
        title: "CO app handover — master tracker + finalised artefacts",
        description: "Maintain a master tracker of all modules, process documents and indicators by vertical with status. Hand finalised artefacts to the app team for build on a rolling basis within 2–3 months.",
        targetDate: "2026-08-31",
        activities: [
          {
            title: "6.1 Master tracker — modules / process docs / indicators by vertical with status (owner: Malar) — set up Week 1, ongoing",
            description: "Maintain master tracker of all modules / process docs / indicators by vertical with live status. Feeds into programme oversight.",
            dueDate: "2026-06-12",
          },
          {
            title: "6.2 Hand finalised artefacts to app team (owner: Malar → Vishnu) — rolling, within 2–3 months",
            description: "Rolling handover of finalised artefacts to the app team for build. Target completion within 2–3 months.",
            dueDate: "2026-08-31",
          },
        ],
      },
      {
        title: "Chennai team — Children work session",
        description: "Plan and run a session with the Chennai team on Children work within the month.",
        targetDate: "2026-07-05",
        activities: [
          {
            title: "7.1 Plan + run Chennai session on Children work (owner: Malar) — within the month",
            description: "Plan and run a session with the Chennai team on Children work. Feeds into Children vertical capability.",
            dueDate: "2026-07-05",
          },
        ],
      },
    ],
  },
];

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const malar = await prisma.user.findFirst({
    where: { name: { startsWith: MALAR_NAME_PREFIX, mode: "insensitive" } },
    select: { id: true, name: true, email: true },
  });
  if (!malar) {
    console.error(`Could not find user with name starting "${MALAR_NAME_PREFIX}"`);
    process.exit(1);
  }
  console.log(`Owner: ${malar.name} <${malar.email}> (${malar.id})`);
  console.log(APPLY ? "Mode: APPLY (will write to DB)" : "Mode: DRY RUN (no writes)\n");

  let stats = { goalsCreated: 0, goalsSkipped: 0, pitstopsCreated: 0, pitstopsSkipped: 0, activitiesCreated: 0, activitiesSkipped: 0 };

  for (const g of GOALS) {
    console.log(`\n── Goal: ${g.title}`);
    let goalId: string;
    const existingGoal = await prisma.goal.findFirst({
      where: { title: g.title, ownerId: malar.id, deletedAt: null },
      select: { id: true },
    });
    if (existingGoal) {
      console.log(`   [skip] goal exists (${existingGoal.id})`);
      stats.goalsSkipped++;
      goalId = existingGoal.id;
    } else if (APPLY) {
      const created = await prisma.goal.create({
        data: {
          title: g.title,
          description: g.description,
          status: "Active",
          ownerId: malar.id,
          startDate: new Date(`2026-06-08T00:00:00+05:30`),
          targetDate: new Date(`${g.targetDate}T23:59:59+05:30`),
        },
      });
      await prisma.goalFollow.upsert({
        where: { userId_goalId: { userId: malar.id, goalId: created.id } },
        create: { userId: malar.id, goalId: created.id },
        update: {},
      });
      console.log(`   [create] goal ${created.id}`);
      stats.goalsCreated++;
      goalId = created.id;
    } else {
      console.log(`   [dry] would create goal, target=${g.targetDate}`);
      stats.goalsCreated++;
      goalId = "<dry-goal>";
    }

    let pitstopOrder = 0;
    for (const ps of g.pitstops) {
      let pitstopId: string;
      const existingPs = goalId !== "<dry-goal>"
        ? await prisma.pitstop.findFirst({ where: { goalId, title: ps.title, deletedAt: null }, select: { id: true } })
        : null;
      if (existingPs) {
        console.log(`   • [skip] pitstop "${ps.title}" (${existingPs.id})`);
        stats.pitstopsSkipped++;
        pitstopId = existingPs.id;
      } else if (APPLY) {
        const createdPs = await prisma.pitstop.create({
          data: {
            title: ps.title,
            notes: ps.description,
            type: "Discussion",
            status: "Upcoming",
            goalId,
            ownerId: malar.id,
            ownerInherited: false,
            order: pitstopOrder,
            startDate: new Date(`2026-06-08T00:00:00+05:30`),
            targetDate: new Date(`${ps.targetDate}T23:59:59+05:30`),
          },
        });
        console.log(`   • [create] pitstop "${ps.title}" (${createdPs.id})`);
        stats.pitstopsCreated++;
        pitstopId = createdPs.id;
      } else {
        console.log(`   • [dry] would create pitstop "${ps.title}", target=${ps.targetDate}`);
        stats.pitstopsCreated++;
        pitstopId = "<dry-ps>";
      }
      pitstopOrder++;

      for (const act of ps.activities) {
        const existingEvt = pitstopId !== "<dry-ps>"
          ? await prisma.pitstopEvent.findFirst({
              where: {
                title: act.title,
                deletedAt: null,
                pitstops: { some: { pitstopId } },
              },
              select: { id: true },
            })
          : null;
        if (existingEvt) {
          console.log(`     · [skip] activity "${act.title.slice(0, 60)}…" (${existingEvt.id})`);
          stats.activitiesSkipped++;
          continue;
        }
        if (APPLY) {
          const scheduledAt = ist10am(act.dueDate);
          const createdEvt = await prisma.pitstopEvent.create({
            data: {
              title: act.title,
              description: act.description,
              type: "Meeting",
              status: "Scheduled",
              scheduledAt,
              originalScheduledAt: scheduledAt,
              createdById: malar.id,
              pitstops: { create: [{ pitstopId }] },
              attendees: { create: [{ userId: malar.id, status: "accepted" }] },
            },
          });
          console.log(`     · [create] activity ${createdEvt.id} due ${act.dueDate}`);
          stats.activitiesCreated++;
        } else {
          console.log(`     · [dry] would create activity due ${act.dueDate}: "${act.title.slice(0, 70)}…"`);
          stats.activitiesCreated++;
        }
      }
    }
  }

  console.log("\n── Summary");
  console.log(JSON.stringify(stats, null, 2));
  if (!APPLY) console.log("\n(dry run — pass --apply to write)");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
