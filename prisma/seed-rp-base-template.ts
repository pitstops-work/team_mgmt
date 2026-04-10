import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const OWNER_ID = "cmnlqtlnu000004js9km2w1i7";

async function main() {
  const goal = await prisma.goal.create({
    data: {
      title: "[TEMPLATE] RP Quarterly Work Plan — Base Cluster (2–3 Clusters)",
      description:
        "Quarterly work plan for a Resource Person covering 2–3 base clusters. " +
        "A base cluster is roughly half the activity level of a typical cluster (~10 working days/month per cluster). " +
        "One RP covers 2–3 base clusters = 20–30 days/month total. " +
        "Programs present but at lower scale: fewer community groups, one children's centre, one youth centre, one elderly centre, fewer creches. " +
        "Clone and rename per RP, tagging their specific clusters under Geography.",
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

  // ── WELFARE RIGHTS (~0.75 days/month per cluster) ─────────────────────────
  // Combined into one lighter monthly touchpoint per cluster + quarterly training

  await addPitstop({
    title: "WR: Combined Community & Partner Review",
    type: "Meeting",
    recurrence: "Monthly",
    order: 1,
    notes:
      "Combined monthly meeting: community group representatives + partner team together. " +
      "Lighter than typical — covers WR case status, partner progress, and immediate issues in one sitting. " +
      "Run this for each base cluster on rotation (same week, different days).",
    checklist: [
      "Community group representatives present",
      "Partner (cluster coordinator + COs) present",
      "Active WR cases reviewed",
      "Previous month action items followed up",
      "Issues and escalations logged",
      "Next month priorities agreed",
      "Notes shared with partner within 2 days",
    ],
  });

  await addPitstop({
    title: "WR: Rights Training (Quarterly)",
    type: "Training",
    recurrence: "Quarterly",
    order: 2,
    notes:
      "Quarterly rights training for the partner team. In a base cluster the frequency is reduced " +
      "from monthly to quarterly given lighter partner capacity. Topics: civic amenities, " +
      "land & housing rights, welfare schemes. Can be done as a joint session for all base clusters in the zone.",
    checklist: [
      "Training topic selected for the quarter",
      "All base cluster COs invited (joint session if possible)",
      "Training material prepared",
      "Practical case examples included",
      "Attendance recorded",
      "Follow-up reading material distributed",
    ],
  });

  // ── CHILDREN 4–14 (~2.5 days/month per cluster) ───────────────────────────

  await addPitstop({
    title: "Children: Weekly Centre Visit",
    type: "SiteVisit",
    recurrence: "Weekly",
    order: 3,
    notes:
      "Visit the children's centre once a week (½ day). In a base cluster there is one children's centre " +
      "vs. two or more in a typical cluster — so visit frequency is once weekly rather than twice. " +
      "Rotate across clusters if covering more than one.",
    checklist: [
      "Centre activities observed",
      "Coordinator supported on activity execution",
      "Attendance register reviewed",
      "Learning quality spot-check done",
      "Infrastructure or material needs noted",
      "Brief debrief with coordinator done",
    ],
  });

  await addPitstop({
    title: "Children: Monthly Training",
    type: "Training",
    recurrence: "Monthly",
    order: 4,
    notes:
      "Attend the monthly training for children's programme activities and reinforce learning with the coordinator.",
    checklist: [
      "Training topic aligned with monthly plan",
      "Full session attended",
      "Key points shared with centre coordinator",
      "Attendance recorded",
    ],
  });

  // ── YOUTH 15–21 (~1.25 days/month per cluster) ────────────────────────────

  await addPitstop({
    title: "Youth: Fortnightly Centre Visit + CAP Review",
    type: "SiteVisit",
    recurrence: "Monthly",
    order: 5,
    notes:
      "Visit youth resource centre fortnightly (every other Saturday) to review CAP progress and support coordinator. " +
      "Lighter than typical (which is every Saturday) given lower scale of a base cluster. " +
      "Note both fortnightly visits in checklist.",
    checklist: [
      "Visit 1 (fortnight 1): youth centre visited",
      "Visit 1: youth groups met and CAP progress checked",
      "Visit 1: coordinator support provided",
      "Visit 2 (fortnight 2): youth centre visited",
      "Visit 2: youth groups met and CAP progress checked",
      "Visit 2: coordinator support provided",
      "Issues and wins documented across both visits",
    ],
  });

  await addPitstop({
    title: "Youth: Monthly Training",
    type: "Training",
    recurrence: "Monthly",
    order: 6,
    notes:
      "Attend monthly youth programme training and brief coordinator on key takeaways.",
    checklist: [
      "Training topic aligned with monthly plan",
      "Full session attended",
      "Coordinator briefed post-training",
      "Attendance recorded",
    ],
  });

  // ── ELDERLY 55+ (~2.75 days/month per cluster) ────────────────────────────

  await addPitstop({
    title: "Elderly: Monthly Review and Team Training",
    type: "Review",
    recurrence: "Monthly",
    order: 7,
    notes:
      "Combined monthly session: first review centre operations and outreach, then conduct team training. " +
      "In a base cluster both are combined into one visit day to stay within effort envelope. ",
    checklist: [
      "Centre visited and operations observed",
      "Outreach coverage vs. target reviewed",
      "Caregiver welfare checked",
      "Health referral cases followed up",
      "Training topic prepared and delivered",
      "Team feedback and action points documented",
    ],
  });

  await addPitstop({
    title: "Elderly: Field Day with CO",
    type: "SiteVisit",
    recurrence: "Monthly",
    order: 8,
    notes:
      "Spend one day with the community organizer on the field each month. " +
      "Base cluster typically has 1 CO (vs. 2 in typical), so one field day/month.",
    checklist: [
      "Field day with CO completed",
      "Outreach households visited and observed",
      "CO capacity gaps identified",
      "On-the-spot coaching provided",
      "Observations documented",
    ],
  });

  await addPitstop({
    title: "Elderly: CSO Referral Mapping",
    type: "Research",
    recurrence: "Quarterly",
    order: 9,
    notes:
      "Map local CSOs and government services relevant to elderly in the base cluster area. " +
      "Establish referral relationships. Done once per quarter.",
    checklist: [
      "CSOs / govt services identified",
      "At least 1 new referral contact established",
      "Referral directory updated",
      "At least 1 referral completed and documented",
    ],
  });

  // ── CRECHES 0–3 (~1.5 days/month per cluster) ─────────────────────────────

  await addPitstop({
    title: "Creche: Monthly Rounds",
    type: "SiteVisit",
    recurrence: "Monthly",
    order: 10,
    notes:
      "Monthly visits to all creches in the base cluster (~5–6 creches at 25% coverage vs. 11 in typical). " +
      "~1.5 days per cluster per month. If covering 2 clusters, plan across two separate days.",
    checklist: [
      "All creches in cluster 1 visited",
      "All creches in cluster 2 visited (if applicable)",
      "All creches in cluster 3 visited (if applicable)",
      "Caregiver conduct observed in each creche",
      "Child nutrition records reviewed",
      "Hygiene and safety standards checked",
      "Issues flagged to supervisor immediately",
      "Creche visit log updated",
    ],
  });

  await addPitstop({
    title: "Creche: Supervisor Review",
    type: "Meeting",
    recurrence: "Monthly",
    order: 11,
    notes:
      "Monthly review with creche supervisors covering all base clusters. Quality, caregiver issues, expansion pipeline.",
    checklist: [
      "Supervisors for all base clusters attended",
      "Field visit findings discussed",
      "Caregiver concerns addressed",
      "Expansion / new creche pipeline reviewed",
      "Action items documented",
    ],
  });

  // ── TEAM & ADMIN (~1.25 days/month) ─────────────────────────────────────

  await addPitstop({
    title: "City / Zonal Team Review",
    type: "Meeting",
    recurrence: "Monthly",
    order: 12,
    notes:
      "Attend monthly city or zonal RP team review. Present update across all base clusters managed.",
    checklist: [
      "Attended city / zonal team review",
      "Update presented for all base clusters",
      "Cross-learning shared with team",
      "Systemic issues flagged to PM",
      "Action items noted",
    ],
  });

  await addPitstop({
    title: "Quarterly Report — All Base Clusters",
    type: "Review",
    recurrence: "Quarterly",
    order: 13,
    notes:
      "Quarterly programme report covering all base clusters managed. " +
      "Lighter than a typical cluster report but must cover all clusters in one document.",
    checklist: [
      "Data compiled for all base clusters (WR, children, youth, elderly, creche)",
      "Partner inputs received for each cluster",
      "Key challenges and learnings written",
      "Cross-cluster patterns and differences noted",
      "Next quarter priorities per cluster drafted",
      "Report reviewed with PM before submission",
      "Report submitted on time",
    ],
  });

  await addPitstop({
    title: "Documentation and Desk Work",
    type: "Custom",
    recurrence: "Monthly",
    order: 14,
    notes:
      "Field visit notes, MIS updates, partner communications, and coordination across 2–3 clusters.",
    checklist: [
      "Field notes from all cluster visits compiled",
      "MIS updated for all base clusters",
      "Partner communications responded to",
      "Pending escalations followed up",
      "Leave and attendance recorded",
    ],
  });

  console.log(`\n✔ Base cluster template created with 14 pitstops.`);
  console.log(`  Goal ID: ${goal.id}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
