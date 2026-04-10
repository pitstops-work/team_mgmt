import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const OWNER_ID = "cmnlqtlnu000004js9km2w1i7";

async function main() {
  const goal = await prisma.goal.create({
    data: {
      title: "[TEMPLATE] RP Quarterly Work Plan — Full Coverage Cluster",
      description:
        "Quarterly work plan for a Resource Person covering one full coverage cluster. " +
        "Full coverage = saturation mode across all programmes: 2–4 children's centres, 2+ youth centres, " +
        "full elderly coverage, ~22 creches (50% coverage). " +
        "Estimated 35–39 working days/month (vs. 20 for a typical cluster). " +
        "This is the most demanding RP role. Not active in FY 26-27 but planned for future years.",
      status: "Active",
      ownerId: OWNER_ID,
    },
  });
  console.log(`✔ Created goal: ${goal.id}`);

  async function addPitstop(data: {
    title: string;
    type: string;
    notes: string;
    recurrence: string;
    order: number;
    checklist: string[];
  }) {
    const p = await prisma.pitstop.create({
      data: {
        goalId: goal.id,
        ownerId: OWNER_ID,
        ownerInherited: false,
        title: data.title,
        type: data.type as never,
        notes: data.notes,
        recurrence: data.recurrence as never,
        status: "Upcoming",
        order: data.order,
      },
    });
    for (let i = 0; i < data.checklist.length; i++) {
      await prisma.checklistItem.create({
        data: { pitstopId: p.id, text: data.checklist[i], order: i },
      });
    }
    console.log(`  + ${data.title}`);
  }

  // ── WELFARE RIGHTS (1.5 days/month — same as typical) ────────────────────

  await addPitstop({
    title: "WR: Community Group Meeting",
    type: "Meeting",
    recurrence: "Monthly",
    order: 1,
    notes:
      "Monthly meeting with all community groups at cluster level. Full coverage cluster may have more slums " +
      "and community groups — ensure all are represented.",
    checklist: [
      "Pre-meeting agenda circulated to partner",
      "All community groups represented (check count against cluster total)",
      "Active WR cases reviewed",
      "New issues and escalations documented",
      "Follow-up action owners assigned",
      "Meeting notes shared with partner",
    ],
  });

  await addPitstop({
    title: "WR: Partner Review Meeting",
    type: "Meeting",
    recurrence: "Monthly",
    order: 2,
    notes:
      "Monthly review with partner team. Full coverage may mean more COs and a larger partner team — plan extra time.",
    checklist: [
      "Cluster coordinator and all COs present",
      "Previous month action items reviewed",
      "Pending WR cases status updated",
      "MIS data cross-checked with field reality",
      "Priorities for next month agreed",
    ],
  });

  await addPitstop({
    title: "WR: Rights Training",
    type: "Training",
    recurrence: "Monthly",
    order: 3,
    notes:
      "Monthly training on civic amenities, land & housing rights, welfare schemes. Same as typical cluster.",
    checklist: [
      "Training topic selected",
      "Material prepared",
      "All COs and coordinator attended",
      "Practice / role-play included",
      "Attendance recorded",
      "Follow-up material distributed",
    ],
  });

  // ── CHILDREN 4–14 (15–26 days/month — largest increase in full coverage) ──
  // Multiple centres: 3–4 centres instead of 1.
  // Weekly govt school visits (vs monthly in typical).
  // Handholding: 2x–3x more effort (8–12 extra days).

  await addPitstop({
    title: "Children: Centre Visits — All Centres (Twice-Weekly Each)",
    type: "SiteVisit",
    recurrence: "Weekly",
    order: 4,
    notes:
      "Visit each children's centre twice a week to handhold coordinators. " +
      "Full coverage cluster has 2–4 centres (vs. 1 in typical). " +
      "This is the single highest-effort item in full coverage (~8–12 days/month). " +
      "Plan a weekly route covering all centres across the two visits.",
    checklist: [
      "Centre 1 visited (visit 1 of 2 this week)",
      "Centre 2 visited (visit 1 of 2 this week)",
      "Centre 3 visited (visit 1 of 2 this week, if applicable)",
      "Centre 4 visited (visit 1 of 2 this week, if applicable)",
      "Centre 1 visited (visit 2 of 2 this week)",
      "Centre 2 visited (visit 2 of 2 this week)",
      "Centre 3 visited (visit 2 of 2 this week, if applicable)",
      "Centre 4 visited (visit 2 of 2 this week, if applicable)",
      "Coordinator support and feedback given at each centre",
      "Learning quality spot-check done in at least 2 centres",
      "Issues and material needs flagged",
    ],
  });

  await addPitstop({
    title: "Children: Monthly Training",
    type: "Training",
    recurrence: "Monthly",
    order: 5,
    notes:
      "Attend monthly children's programme training. With multiple centres, coordinate across all coordinators post-training.",
    checklist: [
      "Training topic aligned with monthly plan",
      "Full session attended",
      "All centre coordinators briefed post-training",
      "Attendance recorded",
    ],
  });

  await addPitstop({
    title: "Children: Weekly Govt School Visit + DI Coordination",
    type: "Meeting",
    recurrence: "Weekly",
    order: 6,
    notes:
      "Full coverage clusters include active government public school engagement. " +
      "Weekly school visit (¼ day) vs. monthly in a typical cluster — reflecting deeper school-community work, " +
      "out-of-school children tracking, and coordination with the District Inspector (DI) on dropouts.",
    checklist: [
      "Target school visited this week",
      "School head / teacher met",
      "Out-of-school / dropout children follow-up done",
      "DI coordination progressed (as needed)",
      "School-community engagement action updated",
      "Field notes recorded",
    ],
  });

  // ── YOUTH 15–21 (4.5 days/month — 2 extra days for additional centres) ────

  await addPitstop({
    title: "Youth: Saturday Centre Visits — All Centres + CAP Review",
    type: "SiteVisit",
    recurrence: "Weekly",
    order: 7,
    notes:
      "Visit all youth resource centres every Saturday and review CAP progress with youth groups. " +
      "Full coverage has 2–3 youth centres (vs. 1 in typical) — plan route to cover all centres on Saturdays " +
      "or split across two Saturdays alternating.",
    checklist: [
      "Centre 1 visited",
      "Centre 2 visited",
      "Centre 3 visited (if applicable)",
      "Youth groups met for CAP review in each centre",
      "CAP milestones updated",
      "Each coordinator supported",
      "Issues and wins documented",
    ],
  });

  await addPitstop({
    title: "Youth: Monthly Training",
    type: "Training",
    recurrence: "Monthly",
    order: 8,
    notes:
      "Attend monthly youth programme training. Ensure all centre coordinators are briefed post-session.",
    checklist: [
      "Full session attended",
      "Key learning shared with all youth coordinators",
      "Attendance recorded",
    ],
  });

  // ── ELDERLY 55+ (5.5 days/month — same as typical, no change in full coverage) ──

  await addPitstop({
    title: "Elderly: Monthly Centre and Outreach Review",
    type: "Review",
    recurrence: "Monthly",
    order: 9,
    notes:
      "Monthly review of the elderly care centre and outreach. Same as typical cluster — no change in full coverage.",
    checklist: [
      "Centre visited and operations observed",
      "Outreach coverage vs. target reviewed",
      "Caregiver welfare checked",
      "Health referral cases followed up",
      "Coordinator supported",
      "Issues escalated with action owners",
    ],
  });

  await addPitstop({
    title: "Elderly: Monthly Team Training",
    type: "Training",
    recurrence: "Monthly",
    order: 10,
    notes: "Monthly training for the full elderly care team.",
    checklist: [
      "Training topic prepared",
      "All staff attended (coordinator, helpers, outreach workers, therapists)",
      "Practical demonstration included",
      "Action points documented",
    ],
  });

  await addPitstop({
    title: "Elderly: Field Day with Community Organizers",
    type: "SiteVisit",
    recurrence: "Monthly",
    order: 11,
    notes:
      "One full day with each CO on the field. 2 COs = 2 days/month — same as typical cluster.",
    checklist: [
      "Field day with CO-1 completed",
      "Field day with CO-2 completed",
      "Outreach observations documented for both COs",
      "Coaching and support provided",
    ],
  });

  await addPitstop({
    title: "Elderly: CSO Referral Mapping and Maintenance",
    type: "Research",
    recurrence: "Quarterly",
    order: 12,
    notes:
      "Map and maintain referral network with local CSOs and govt services. " +
      "In a full coverage cluster, referral volume is higher — ensure the network is active, not just mapped.",
    checklist: [
      "CSO referral directory reviewed and updated",
      "At least 2 new referral contacts added this quarter",
      "Referral utilisation data compiled (how many referrals made)",
      "At least 2 successful referrals documented",
      "Referral gaps identified and action planned",
    ],
  });

  // ── CRECHES 0–3 (6 days/month — 3 extra days for 11 more creches) ─────────
  // Full coverage = 50% = ~22 creches (vs. 11 in typical)

  await addPitstop({
    title: "Creche: Monthly Rounds — All Creches (Full Coverage)",
    type: "SiteVisit",
    recurrence: "Monthly",
    order: 13,
    notes:
      "Monthly 2-hour visit to each creche. Full coverage cluster has ~22 creches (50% of ~1100 children) " +
      "vs. 11 in typical. Plan as a 2-week rolling schedule of creche visits. ~6 days/month total.",
    checklist: [
      "Week 1: Creches 1–6 visited",
      "Week 2: Creches 7–11 visited",
      "Week 3: Creches 12–16 visited",
      "Week 4: Creches 17–22 visited",
      "Caregiver conduct observed in all creches",
      "Child nutrition records reviewed",
      "Hygiene and safety spot-checks done",
      "Concerns flagged to supervisor same day",
      "Creche visit log fully updated",
    ],
  });

  await addPitstop({
    title: "Creche: Supervisor Review",
    type: "Meeting",
    recurrence: "Monthly",
    order: 14,
    notes:
      "Monthly review with both creche supervisors (full coverage has 2 supervisors for ~22 creches). " +
      "Cover quality issues, caregiver performance, expansion if any.",
    checklist: [
      "Both supervisors present",
      "Monthly rounds findings discussed",
      "Caregiver performance issues addressed",
      "Expansion / new creche pipeline reviewed",
      "Support request to city/zonal RP flagged if needed",
      "Action items documented",
    ],
  });

  // ── TEAM & ADMIN (~2.5 days/month) ───────────────────────────────────────

  await addPitstop({
    title: "City / Zonal Team Review",
    type: "Meeting",
    recurrence: "Monthly",
    order: 15,
    notes:
      "Attend monthly city-level or zonal RP review. Full coverage RP should bring detailed updates " +
      "as their cluster is the benchmark for future planning.",
    checklist: [
      "Attended city / zonal team review",
      "Cluster update presented across all domains",
      "Lessons from full coverage experience shared",
      "Systemic issues flagged to PM",
      "Action items noted",
    ],
  });

  await addPitstop({
    title: "Quarterly Report and Programme Review",
    type: "Review",
    recurrence: "Quarterly",
    order: 16,
    notes:
      "Comprehensive quarterly report. Full coverage cluster report is the most detailed — " +
      "it captures the saturation model in practice and informs planning for other clusters.",
    checklist: [
      "WR data compiled (cases, outcomes, coverage)",
      "Children programme data — all centres compiled",
      "Youth programme data — all centres compiled",
      "Elderly programme data compiled",
      "Creche programme data — all 22 creches compiled",
      "School engagement outcomes documented",
      "Partner inputs received",
      "Key challenges and learnings written",
      "What-worked / what-didn't section included",
      "Next quarter priorities drafted",
      "Report reviewed with PM",
      "Report submitted on time",
    ],
  });

  await addPitstop({
    title: "Documentation and Desk Work",
    type: "Custom",
    recurrence: "Monthly",
    order: 17,
    notes:
      "~2 days/month for notes, MIS, communications, and coordination. " +
      "Volume is higher in full coverage given more centres and more partner touchpoints.",
    checklist: [
      "Field visit notes from all centres compiled",
      "MIS / database updated (all domains)",
      "Partner communications responded to",
      "Pending escalations followed up",
      "Resource materials organised and shared",
      "Leave and attendance recorded",
    ],
  });

  console.log(`\n✔ Full coverage cluster template created with 17 pitstops.`);
  console.log(`  Goal ID: ${goal.id}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
