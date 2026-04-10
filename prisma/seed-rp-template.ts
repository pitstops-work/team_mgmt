import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Template owner — Vishnu (admin)
const OWNER_ID = "cmnlqtlnu000004js9km2w1i7";

async function main() {
  // ── Create the template goal ──────────────────────────────────────────────
  const goal = await prisma.goal.create({
    data: {
      title: "[TEMPLATE] RP Quarterly Work Plan — Typical Cluster",
      description:
        "Quarterly work plan for a Resource Person covering one typical cluster (~6000 households, 11 slums). " +
        "Covers Welfare Rights, Children (4–14), Youth (15–21), Elderly (55+), Creches (0–3), and Team/Admin. " +
        "~20 working days per month. Clone this goal for each RP and assign to the relevant cluster.",
      status: "Active",
      ownerId: OWNER_ID,
    },
  });
  console.log(`✔ Created goal: ${goal.id}`);

  // ── Helper ────────────────────────────────────────────────────────────────
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
    return p;
  }

  // ── WELFARE RIGHTS (1.5 days/month) ──────────────────────────────────────
  await addPitstop({
    title: "WR: Community Group Meeting",
    type: "Meeting",
    recurrence: "Monthly",
    order: 1,
    notes:
      "Monthly meeting with all 11 community groups at cluster level. " +
      "Review welfare rights issues, escalations, and community organizer progress.",
    checklist: [
      "Pre-meeting agenda circulated to partner",
      "All 11 slum community groups represented",
      "Active welfare rights cases reviewed",
      "New issues / escalations documented",
      "Follow-up action owners assigned",
      "Meeting notes shared with partner post-meeting",
    ],
  });

  await addPitstop({
    title: "WR: Partner Review Meeting",
    type: "Meeting",
    recurrence: "Monthly",
    order: 2,
    notes:
      "Monthly review meeting with partner organisation (cluster coordinator + community organizers). " +
      "Progress on pending cases, target vs. actuals, priorities for next month.",
    checklist: [
      "Cluster coordinator and all COs present",
      "Previous month's action items reviewed",
      "Pending WR cases status updated",
      "MIS data cross-checked with field reality",
      "Priorities and targets for next month agreed",
    ],
  });

  await addPitstop({
    title: "WR: Rights Training",
    type: "Training",
    recurrence: "Monthly",
    order: 3,
    notes:
      "Monthly training for the partner team on civic amenities, land & housing rights. " +
      "Topics rotate: ration cards, Aadhaar, patta, eviction rights, welfare schemes.",
    checklist: [
      "Training topic selected (civic amenities / land / housing / scheme)",
      "Training material / resource sheet prepared",
      "All COs and cluster coordinator attended",
      "Practice scenarios / role-play conducted",
      "Attendance recorded and shared",
      "Follow-up reading material distributed",
    ],
  });

  // ── CHILDREN 4–14 (5 days/month) ─────────────────────────────────────────
  await addPitstop({
    title: "Children: Centre Visit (Twice-Weekly Handholding)",
    type: "SiteVisit",
    recurrence: "Weekly",
    order: 4,
    notes:
      "Visit the children's centre twice a week (½ day each). Handhold the centre coordinator " +
      "in planned activities, quality review, and day-to-day problem solving.",
    checklist: [
      "Centre activity for the day observed",
      "Coordinator supported on planned activity execution",
      "Attendance register reviewed",
      "Learning quality spot-check done (reading / numeracy)",
      "Infrastructure / material needs flagged",
      "Coordinator feedback and debrief completed",
    ],
  });

  await addPitstop({
    title: "Children: Monthly Training",
    type: "Training",
    recurrence: "Monthly",
    order: 5,
    notes:
      "Attend the monthly training for children's programme planned activities. " +
      "Support coordinator with context and reinforce learning back at centre.",
    checklist: [
      "Training topic aligned with monthly activity calendar",
      "Full session attended",
      "Key learning points noted",
      "Centre coordinator briefed post-training",
      "Attendance recorded",
    ],
  });

  await addPitstop({
    title: "Children: Govt School / DI Coordination Visit",
    type: "Meeting",
    recurrence: "Monthly",
    order: 6,
    notes:
      "Visit relevant government schools and coordinate with District Inspector (DI) " +
      "for school-community engagement, out-of-school children identification, and dropout follow-up.",
    checklist: [
      "Target school(s) visited / DI contacted",
      "Out-of-school children list updated",
      "Dropout children followed up with partner",
      "School-community engagement plan progressed",
      "Next steps documented and shared with partner",
    ],
  });

  // ── YOUTH 15–21 (2.5 days/month) ─────────────────────────────────────────
  await addPitstop({
    title: "Youth: Saturday Centre Visit + CAP Group Review",
    type: "SiteVisit",
    recurrence: "Weekly",
    order: 7,
    notes:
      "Every Saturday: visit youth resource centre and meet youth groups to review Community Action Plan (CAP) " +
      "progress. ½ day per week. Support centre coordinator and track youth group momentum.",
    checklist: [
      "Youth centre visited",
      "Youth coordinator supported",
      "Youth groups met for CAP progress review",
      "CAP milestones status updated",
      "Blockers / issues logged",
      "Encouraging examples / wins noted for motivation",
    ],
  });

  await addPitstop({
    title: "Youth: Monthly Training",
    type: "Training",
    recurrence: "Monthly",
    order: 8,
    notes:
      "Attend monthly training for the youth programme. Reinforce with the centre coordinator after the session.",
    checklist: [
      "Training topic aligned with monthly plan",
      "Full session attended",
      "Key learning shared with youth coordinator",
      "Attendance recorded",
    ],
  });

  // ── ELDERLY 55+ (5.5 days/month) ─────────────────────────────────────────
  await addPitstop({
    title: "Elderly: Monthly Centre and Outreach Review",
    type: "Review",
    recurrence: "Monthly",
    order: 9,
    notes:
      "Monthly review of the elderly care centre operations and outreach coverage. " +
      "Check quality of care, caregiver welfare, and centre-community linkages.",
    checklist: [
      "Centre visited and operations observed",
      "Outreach coverage vs. target reviewed",
      "Caregiver welfare and workload checked",
      "Health referral cases followed up",
      "Centre coordinator supported",
      "Issues escalated with action owners",
    ],
  });

  await addPitstop({
    title: "Elderly: Monthly Team Training",
    type: "Training",
    recurrence: "Monthly",
    order: 10,
    notes:
      "Conduct monthly training for the elderly care team (centre coordinator, helpers, outreach workers, therapists).",
    checklist: [
      "Training topic prepared (geriatric care / rights / therapy basics)",
      "All team members attended",
      "Practical demonstration included",
      "Feedback from team collected",
      "Action points documented",
    ],
  });

  await addPitstop({
    title: "Elderly: Field Day with Community Organizers (CO-1 & CO-2)",
    type: "SiteVisit",
    recurrence: "Monthly",
    order: 11,
    notes:
      "Spend one full day each with CO-1 and CO-2 on the field. " +
      "Observe their work, identify capacity gaps, provide on-the-job support. 2 days/month total.",
    checklist: [
      "Field day with CO-1 completed",
      "Field day with CO-2 completed",
      "Outreach households visited and observed",
      "CO capacity gaps identified",
      "On-the-spot coaching provided",
      "Observations documented for supervisor",
    ],
  });

  await addPitstop({
    title: "Elderly: CSO Mapping and Referral Network",
    type: "Research",
    recurrence: "Quarterly",
    order: 12,
    notes:
      "Map local civil society organisations (CSOs) in the cluster area that can serve as referral points " +
      "for elderly care — hospitals, pension schemes, helplines, specialised NGOs. Establish active referral relationships.",
    checklist: [
      "CSOs / govt services relevant to elderly identified",
      "At least 2 new referral contacts established this quarter",
      "Referral directory updated and shared with team",
      "At least 1 successful referral completed and documented",
      "Feedback from referred beneficiary collected",
    ],
  });

  // ── CRECHES 0–3 YEARS (3 days/month) ─────────────────────────────────────
  await addPitstop({
    title: "Creche: Monthly Rounds (All Creches in Cluster)",
    type: "SiteVisit",
    recurrence: "Monthly",
    order: 13,
    notes:
      "Spend 2 hours in each creche monthly (~11 creches per typical cluster = ~3 days). " +
      "Observe caregiver practice, child wellbeing, nutrition, and safety standards.",
    checklist: [
      "All creches in cluster visited this month",
      "Caregiver attendance and conduct observed",
      "Child nutrition records reviewed",
      "Hygiene and safety standards checked",
      "Positive practices documented",
      "Concerns flagged to supervisor immediately",
      "Creche visit log updated",
    ],
  });

  await addPitstop({
    title: "Creche: Monthly Supervisor Review",
    type: "Meeting",
    recurrence: "Monthly",
    order: 14,
    notes:
      "Monthly review meeting with creche supervisors. Discuss quality concerns, caregiver issues, " +
      "expansion progress, and support needs.",
    checklist: [
      "Both supervisors attended",
      "Field visit findings from monthly rounds discussed",
      "Caregiver performance issues addressed",
      "Expansion / new creche pipeline reviewed",
      "Support needed from city/zonal RP flagged",
      "Minutes and action items documented",
    ],
  });

  // ── TEAM & ADMIN (2.5 days/month) ────────────────────────────────────────
  await addPitstop({
    title: "City / Zonal Team Review",
    type: "Meeting",
    recurrence: "Monthly",
    order: 15,
    notes:
      "Attend monthly city-level or zonal RP team review. Present cluster updates, cross-learn from " +
      "other RPs, flag systemic issues, align on upcoming priorities.",
    checklist: [
      "Attended city / zonal team review",
      "Cluster programme update presented",
      "At least one cross-learning shared with team",
      "Systemic issues (if any) flagged to PM",
      "Action items from review noted",
    ],
  });

  await addPitstop({
    title: "Quarterly Report and Programme Review",
    type: "Review",
    recurrence: "Quarterly",
    order: 16,
    notes:
      "Prepare and submit the quarterly programme report covering all five domains. " +
      "Include data, analysis, challenges, learnings, and plan for next quarter.",
    checklist: [
      "WR data compiled (cases, outcomes, coverage)",
      "Children programme data compiled",
      "Youth programme data compiled",
      "Elderly programme data compiled",
      "Creche programme data compiled",
      "Partner inputs and MIS data received",
      "Key challenges and learnings section written",
      "Next quarter priorities drafted",
      "Report reviewed with PM before submission",
      "Report submitted on time",
    ],
  });

  await addPitstop({
    title: "Documentation and Desk Work",
    type: "Custom",
    recurrence: "Monthly",
    order: 17,
    notes:
      "~2 days/month for field visit notes, MIS updates, partner communications, " +
      "resource material organisation, and internal coordination.",
    checklist: [
      "Field visit notes from all visits compiled",
      "MIS / database updated with month's data",
      "Partner communications responded to",
      "Pending escalations followed up",
      "Resource materials organised and shared",
      "Leave and attendance recorded",
    ],
  });

  console.log(`\n✔ Template goal created with 17 pitstops.`);
  console.log(`  Goal ID: ${goal.id}`);
  console.log(`  Title: ${goal.title}`);
  console.log(`\nClone this goal for each RP using the app's clone feature.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
