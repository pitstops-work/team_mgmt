import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roleGuard";

// ONE-TIME seed route — creates Shwetha's goals, pitstops, checklists and Q1 plan items
// Admin-only. Delete this file after use.

const GOALS_DATA = [
  {
    title: "Cluster & Field Team Coordination",
    description: "Provide consistent programmatic oversight and coordination across Peenya 2, Bytarayanapura, Jakkur, Hebbala, Bagalur, Sanjayanagar and Majestic-North",
    targetDate: new Date("2027-03-31"),
    pitstops: [
      {
        key: "cluster_meetings" as const,
        title: "Conduct regular meetings with PC, CCs and COs across all North Zone clusters",
        targetDate: new Date("2026-09-30"),
        checklist: [
          "Circulate meeting agenda in advance",
          "Coordinate attendance and venue for all PC, CC and CO participants",
          "Facilitate structured discussion on programme updates, blockers and targets",
          "Document action points of meeting",
          "Follow up on pending action points from the previous meeting",
        ],
      },
      {
        key: "community_meetings" as const,
        title: "Attend and support cluster-level community meetings",
        targetDate: new Date("2026-09-30"),
        checklist: [
          "Confirm meeting schedule and location with cluster coordinator",
          "Review community data and prior meeting notes before attending",
          "Attend meeting and capture key issues raised by community members",
          "Record decisions and action points in field visit report",
        ],
      },
      {
        key: "cluster_progress" as const,
        title: "Review cluster progress with CC/PC monthly",
        targetDate: new Date("2026-12-31"),
        checklist: [
          "Compile programme indicators and activity completion data before review",
          "Notes on cluster-level progress summary",
          "Conduct discussion with CC/PC; identify gaps and corrective actions",
          "Note and track revised timelines and responsible persons",
          "Update notes on the cluster planner for further revisit and progress mapping",
        ],
      },
      {
        key: "cluster_followup" as const,
        title: "Facilitate monthly progress and follow-up discussions with PC and CCs",
        targetDate: new Date("2026-12-31"),
        checklist: [
          "Collate updates from all CCs on activities, challenges and next steps",
          "Schedule monthly follow-up call/meeting with PC and CCs",
          "Track resolution of issues flagged in previous discussions",
          "Update shared action-tracker after each meeting",
          "Discuss and escalate unresolved issues to senior management",
        ],
      },
      {
        key: "collectives_meetings" as const,
        title: "Attend community-level and collectives meetings across all clusters",
        targetDate: new Date("2027-03-31"),
        checklist: [
          "Obtain monthly schedule of collective meetings from each cluster",
          "Attend minimum two community/collective meetings per cluster per month",
          "Document observations and decisions",
          "Share field visit note and inputs with CC and PC for further support and action",
        ],
      },
    ],
  },
  {
    title: "Elderly Programme Roll-out & Management",
    description: "Planning and rollout of Elderly programme in 2 clusters — CFAR and AA as partners",
    targetDate: new Date("2026-12-31"),
    pitstops: [
      {
        key: "elderly_nmt" as const,
        title: "Explore NMT partnership for elderly training and capacity building",
        targetDate: new Date("2026-06-30"),
        checklist: [
          "Introductory meeting with NMT team and visit to NMT elderly centre",
          "Discuss programme plan and design support for field teams CB with NMT",
          "Development of training modules and training facilitation support",
          "Draft MOU/partnership terms based on discussions",
          "Present partnership proposal to management for approval",
          "Finalise training and capacity-building calendar with NMT",
          "Onboard NMT",
        ],
      },
      {
        key: "elderly_forms" as const,
        title: "Develop elderly assessment forms and data collection/profiling tools",
        targetDate: new Date("2026-07-31"),
        checklist: [
          "Review existing elderly assessment frameworks (NMT, government, peer NGOs)",
          "Draft assessment form covering health, social, economic and functional dimensions",
          "Pilot test form with 5–10 elderly individuals in one cluster",
          "Incorporate feedback; finalise form with CC and programme manager",
          "Train field staff on tool usage and data entry protocols",
          "Set up data entry system and quality-check protocol",
        ],
      },
      {
        key: "elderly_field_plan" as const,
        title: "Explore and develop field implementation plans for elderly programme",
        targetDate: new Date("2026-08-31"),
        checklist: [
          "Conduct field visit to CFAR and AA sites to understand current activities",
          "Map existing elderly beneficiaries and services in each cluster",
          "Document gaps between current practice and proposed programme model",
          "Draft field implementation plan in consultation with partner teams",
          "Share implementation plan with PC for review and approval",
        ],
      },
      {
        key: "elderly_coordination" as const,
        title: "Coordinate with partners for elderly team engagement, joint planning and profiling",
        targetDate: new Date("2026-09-30"),
        checklist: [
          "Schedule joint planning meeting with elderly team",
          "Agree on roles, responsibilities and timelines for profiling exercise",
          "Mobilise field staff for household profiling in target areas",
          "Oversee data collection and quality during profiling",
          "Compile and share profiling summary with partners and management",
          "Identify priority beneficiaries for programme enrolment",
        ],
      },
      {
        key: "elderly_learning" as const,
        title: "Conduct cluster-level elderly programme learning and sharing meeting",
        targetDate: new Date("2026-10-31"),
        checklist: [
          "Plan agenda focusing on elderly programme learnings and challenges",
          "Invite CFAR, AA, CC and field staff participants",
          "Facilitate sharing of case studies, data and good practices",
          "Document key learnings and recommendations",
        ],
      },
      {
        key: "elderly_followup" as const,
        title: "Oversee and track post-assessment follow-up action plans per individual",
        targetDate: new Date("2027-03-31"),
        checklist: [
          "Ensure every assessed individual has a documented follow-up action plan",
          "Set up tracking register with individual IDs and action deadlines",
          "Conduct weekly follow-up completion check with coordinators",
          "Flag cases requiring medical or social referrals to relevant agencies",
          "Check on MIS/monthly tracker updating and report progress to management",
        ],
      },
    ],
  },
  {
    title: "Drinking Water Programme Roll-out & Management",
    description: "Planning and rollout, assessment visits, technical partner support and programme implementation",
    targetDate: new Date("2026-12-31"),
    pitstops: [
      {
        key: "water_assessment" as const,
        title: "Coordinate visits to proposed drinking water assessment sites",
        targetDate: new Date("2026-06-30"),
        checklist: [
          "Prepare assessment visit plan with dates, sites and team composition",
          "Conduct preliminary site visits to short-listed locations",
          "Map potential pilot locations based on water access gaps and population density",
          "Participate in community consultation with collectives and local authorities on feasibility",
          "Confirm pilot locations in discussion and consultation with partners",
        ],
      },
      {
        key: "water_partner" as const,
        title: "Finalise technical support partner/organisation for drinking water programme",
        targetDate: new Date("2026-08-31"),
        checklist: [
          "Prepare shortlist of technical support organisations with criteria",
          "Identify and contact potential technical partners/organisations",
          "Conduct meetings with top 3 organisations",
          "Discuss, visit location and review proposals on technical capacity, cost and approach",
          "Select organisation and obtain management approval",
          "Sign MOU/agreement and onboard the technical partner",
        ],
      },
      {
        key: "water_phase1_locs" as const,
        title: "Finalise zones and locations for Phase 1 drinking water implementation",
        targetDate: new Date("2026-09-30"),
        checklist: [
          "Finalise implementation location",
          "Coordinate with partners for implementation",
          "Obtain formal approval for Phase 1 locations",
          "Communicate selected zones to field teams and partners",
        ],
      },
      {
        key: "water_phase1_impl" as const,
        title: "Coordinate with partner for Phase 1 drinking water implementation",
        targetDate: new Date("2026-12-31"),
        checklist: [
          "Visits to locations for monitoring progress",
          "Conduct weekly follow-up with coordinators",
          "Support partners for preparing maintenance plan",
        ],
      },
    ],
  },
  {
    title: "Pilot Programmes",
    description: "Drive the planning, field assessment, and pilot implementations across clusters",
    targetDate: new Date("2027-03-31"),
    pitstops: [
      {
        key: "pilots_concepts" as const,
        title: "Develop concepts and bring proposals for new pilots",
        targetDate: new Date("2026-09-30"),
        checklist: [
          "Facilitate idea-generation sessions with cluster teams",
          "Research similar pilots by peer organisations for benchmarking",
          "Draft concept notes for each proposed pilot",
          "Discuss and present concept notes with manager and incorporate feedback",
          "Develop full pilot proposal with objectives, budget and timeline",
          "Submit proposals for approval",
        ],
      },
      {
        key: "pilots_locations" as const,
        title: "Support team identification of locations and assessments for new initiatives",
        targetDate: new Date("2026-10-31"),
        checklist: [
          "Brief field teams on criteria for selecting initiative locations",
          "Accompany teams on at least one field assessment visit per cluster",
          "Compile assessment findings into a location suitability report",
        ],
      },
    ],
  },
  {
    title: "Partner Relationship & Transition Management",
    description: "Partner management, programme transitions and new partnership development across North Zone",
    targetDate: new Date("2027-03-31"),
    pitstops: [
      {
        key: "sangama_transition" as const,
        title: "Complete Sangama HR profiling for CFAR transition and finalise transition plan",
        targetDate: new Date("2026-06-30"),
        checklist: [
          "Collect and verify HR data for all Sangama staff being transitioned",
          "Map roles, competencies and gaps between Sangama and CFAR structures",
          "Discuss transition plan with timelines, responsibilities and risk mitigation",
          "Review transition plan with CFAR leadership",
          "Monitor transition milestones and report progress weekly",
        ],
      },
      {
        key: "quarterly_partner" as const,
        title: "Attend and follow up on quarterly partner review meetings",
        targetDate: new Date("2027-03-31"),
        checklist: [
          "Circulate agenda before meeting",
          "Attend quarterly partner review meetings",
          "Follow up on North Zone action points within agreed deadlines",
        ],
      },
      {
        key: "meeting_calendars" as const,
        title: "Plan meeting calendars and document all partner engagements",
        targetDate: new Date("2026-06-30"),
        checklist: [
          "Prepare annual engagement calendar covering all partner touchpoints",
          "Share calendar with all partners",
          "Notes of all partner meetings, calls and communications",
          "Revisit and update calendar quarterly based on programme needs",
        ],
      },
      {
        key: "bimonthly_cluster" as const,
        title: "Coordinate bi-monthly cluster-level meetings",
        targetDate: new Date("2026-09-30"),
        checklist: [
          "Schedule bi-monthly dates for all clusters at the start of each quarter",
          "Prepare meeting agenda based on cluster reports and programme priorities",
          "Facilitate the meeting ensuring all clusters contribute updates",
          "Note decisions, action points and owners in meeting notes",
        ],
      },
      {
        key: "all_partner_sl" as const,
        title: "Participate in all-partner Sharing & Learning meetings",
        targetDate: new Date("2026-12-31"),
        checklist: [
          "Support with inputs for collating North Zone updates, case studies and learning points in advance",
          "Participate in all-partner S&L meetings",
          "Coordinate with other zone coordinators and share good practices",
          "Integrate applicable learnings into programme planning",
        ],
      },
    ],
  },
  {
    title: "Sharing & Learning",
    description: "Ensure robust data quality, timely reporting, and knowledge-sharing across all North Zone programmes",
    targetDate: new Date("2027-03-31"),
    pitstops: [
      {
        key: "data_quality" as const,
        title: "Ensure cluster-level field data quality across North Zone",
        targetDate: new Date("2026-09-30"),
        checklist: [
          "Support CC and field staff on data quality standards and common errors",
          "Provide inputs to clusters on data quality findings",
          "Track improvement in data quality",
          "Discuss and escalate persistent data issues to programme manager",
        ],
      },
      {
        key: "cross_zone" as const,
        title: "Attend cross-zone reviews (Bellandur, Bogenhalli, Anekal) as required",
        targetDate: new Date("2027-03-31"),
        checklist: [
          "Attend meetings and document cross-zone learnings and action points",
          "Share cross-zone insights with North Zone team within one week",
          "Incorporate relevant recommendations into North Zone programme plans",
        ],
      },
    ],
  },
  {
    title: "Financial & Programme Management",
    description: "Maintain accurate budget tracking, manage procurements, and ensure on-time financial compliance for all activities",
    targetDate: new Date("2027-03-31"),
    pitstops: [
      {
        key: "budget_tracking" as const,
        title: "Track programme budgets against actuals and flag variances promptly",
        targetDate: new Date("2027-03-31"),
        checklist: [
          "Update budget tracker with actuals against approved budget lines",
          "Check on variance percentages",
          "Document reasons for variance and corrective actions taken",
        ],
      },
      {
        key: "vendor_payments" as const,
        title: "Manage vendor payments for Capacity Building activities",
        targetDate: new Date("2026-09-30"),
        checklist: [
          "Obtain vendor details and documents from Malar",
          "Upload documents in the portal",
          "Verify proforma invoices and bills before submitting",
          "Submit invoice with GRN and approval to finance",
          "Confirm payment release and update payment log",
        ],
      },
      {
        key: "budget_alignment" as const,
        title: "Ensure final budgets align with approved proposals before execution",
        targetDate: new Date("2027-03-31"),
        checklist: [
          "Cross-check activity budget against approved donor proposal before spend",
          "Flag any budget code mismatches to finance and programme manager",
          "Obtain written approval for any reallocation exceeding 10% of line item",
          "Maintain audit trail of all budget approvals and reallocations",
        ],
      },
      {
        key: "stationery_payments" as const,
        title: "Manage stationery and projector payments for capacity-building activities",
        targetDate: new Date("2027-03-31"),
        checklist: [
          "Maintain inventory list of stationery and AV equipment across clusters",
          "Raise timely purchase requests based on upcoming training calendar",
          "Collect invoices from suppliers immediately after delivery",
          "Submit payment documentation to finance within 2 working days",
          "Reconcile payments against activity budgets each month",
        ],
      },
    ],
  },
];

// Pitstop keys — assigned to each pitstop in GOALS_DATA order, used to link events
// G0: Cluster & Field Team Coordination
// G1: Elderly Programme
// G2: Drinking Water
// G3: Pilot Programmes
// G4: Partner Relationship & Transition
// G5: Sharing & Learning
// G6: Financial & Programme Management
type PitstopKey =
  | "cluster_meetings" | "community_meetings" | "cluster_progress" | "cluster_followup" | "collectives_meetings"
  | "elderly_nmt" | "elderly_forms" | "elderly_field_plan" | "elderly_coordination" | "elderly_learning" | "elderly_followup"
  | "water_assessment" | "water_partner" | "water_phase1_locs" | "water_phase1_impl"
  | "pilots_concepts" | "pilots_locations"
  | "sangama_transition" | "quarterly_partner" | "meeting_calendars" | "bimonthly_cluster" | "all_partner_sl"
  | "data_quality" | "cross_zone"
  | "budget_tracking" | "vendor_payments" | "budget_alignment" | "stationery_payments";

// Q1 Activity plan — 13 weeks Apr 6 – Jun 30 2026
// pitstopKeys: which pitstops this week's activity relates to
const ACTIVITIES_DATA: {
  week: number; start: string; end: string; title: string;
  focus: string; summary: string; type: string;
  pitstopKeys: PitstopKey[];
}[] = [
  {
    week: 1, start: "2026-04-06", end: "2026-04-12", type: "Visit",
    title: "Field visit, RP interview, Elderly assessment follow-up and update annual work objectives",
    focus: "North Zone: Peenya 1 & 2",
    summary: "Meeting with PMs and CCs North Zone. Meeting with CCs and COs cluster level. Attend children team capacity building. Drinking water assessment at Pilaganahalli. Online discussion on Elderly Program Assessment sheet. Cluster notes. RP interview.",
    pitstopKeys: ["cluster_meetings", "community_meetings", "water_assessment", "elderly_nmt"],
  },
  {
    week: 2, start: "2026-04-13", end: "2026-04-19", type: "Visit",
    title: "Team meeting, Basic Amenities Assessment finalisation, Elderly programme plan and roll-out",
    focus: "Bagalur & Sanjayanagar",
    summary: "Meeting with CCs and COs. Elderly Programme roll-out. Complete cluster note for Sanjayanagar. Profiling of Sangama employees for CFAR transition. Visit to NMT elderly centre.",
    pitstopKeys: ["cluster_meetings", "community_meetings", "elderly_nmt", "elderly_field_plan", "sangama_transition"],
  },
  {
    week: 3, start: "2026-04-20", end: "2026-04-26", type: "Visit",
    title: "Community meetings, assessments, Sangama team meeting, Sharing and Learning all-partners",
    focus: "Bytarayanapura & Jakkur",
    summary: "Meeting with CCs and COs. Complete cluster note for Bytarayanapura. Profiling of Sangama employees for transition. Community meetings and field assessment with profiled elderly persons.",
    pitstopKeys: ["cluster_meetings", "community_meetings", "sangama_transition", "all_partner_sl", "elderly_coordination"],
  },
  {
    week: 4, start: "2026-04-27", end: "2026-05-03", type: "Meeting",
    title: "Community meeting, partner meeting, Quarterly Review meeting",
    focus: "Hebbala & Majestic-North; cross-zone Bellandur, Bogenhalli & Anekal",
    summary: "Quarterly Review with PC/CC/Managers. Drinking water assessment visit. Basic Amenities follow-up. School as safe spaces follow-up and visits. Meeting with field teams.",
    pitstopKeys: ["quarterly_partner", "cross_zone", "water_assessment", "community_meetings", "cluster_progress"],
  },
  {
    week: 5, start: "2026-05-04", end: "2026-05-10", type: "Visit",
    title: "Team meeting, Basic Amenities Assessment follow-up, Elderly programme",
    focus: "Bagalur & Sanjayanagar",
    summary: "Meeting with CCs and COs. Meeting with YLCs. Visit for post-assessment follow-up. Field assessment and meeting for drinking water. Participate in youth meeting.",
    pitstopKeys: ["cluster_meetings", "community_meetings", "elderly_followup", "water_assessment", "collectives_meetings"],
  },
  {
    week: 6, start: "2026-05-11", end: "2026-05-17", type: "Visit",
    title: "Field visits and discussion on post-assessment follow-ups",
    focus: "Peenya 1 & 2",
    summary: "Meeting with Elderly programme team CFAR. Visit for post-assessment follow-up. Community meeting with COs. Meeting with elderly persons.",
    pitstopKeys: ["elderly_followup", "elderly_coordination", "community_meetings"],
  },
  {
    week: 7, start: "2026-05-18", end: "2026-05-24", type: "Meeting",
    title: "Community meetings, cluster-level partner meetings",
    focus: "Bytarayanapura & Jakkur",
    summary: "Meeting with CCs and COs. Discussion on youth work with teams. Community meetings with COs. Participate in youth meeting.",
    pitstopKeys: ["cluster_meetings", "community_meetings", "collectives_meetings", "bimonthly_cluster"],
  },
  {
    week: 8, start: "2026-05-25", end: "2026-05-31", type: "Visit",
    title: "Team meeting, centre visits, Sharing & Learning all-partners",
    focus: "Hebbala & Majestic-North",
    summary: "Community visit and meeting with collectives. Basic Amenities and welfare rights team meeting with partners. Meeting and discussion for drinking water. Participate in youth meeting.",
    pitstopKeys: ["all_partner_sl", "water_assessment", "community_meetings", "collectives_meetings"],
  },
  {
    week: 9, start: "2026-06-01", end: "2026-06-07", type: "Visit",
    title: "Centre visits, meetings with field teams",
    focus: "Cross-zone: Bellandur, Bogenhalli & Anekal",
    summary: "Meeting with CCs and COs. Meeting with CLCs/youth work. Visit for post-assessment follow-up. Discussion with CCs on progress and follow-ups.",
    pitstopKeys: ["cross_zone", "cluster_meetings", "elderly_followup", "data_quality"],
  },
  {
    week: 10, start: "2026-06-08", end: "2026-06-14", type: "Visit",
    title: "Community meetings, cluster-level partner meetings",
    focus: "Bagalur & Sanjayanagar",
    summary: "Meeting with CCs and COs. Meeting with CLCs/youth work. Visit for post-assessment follow-up. Community meetings with COs. Meeting and discussion for drinking water.",
    pitstopKeys: ["cluster_meetings", "community_meetings", "elderly_followup", "water_assessment"],
  },
  {
    week: 11, start: "2026-06-15", end: "2026-06-21", type: "Meeting",
    title: "Team meeting, assessment follow-up, Elderly programme",
    focus: "Peenya 1 & 2",
    summary: "Meeting with CCs and COs. Discussion on youth work with teams. Community meetings with COs. Meeting and discussion for drinking water.",
    pitstopKeys: ["cluster_meetings", "community_meetings", "elderly_followup", "data_quality", "water_assessment"],
  },
  {
    week: 12, start: "2026-06-22", end: "2026-06-28", type: "Visit",
    title: "Field visits and discussion on post-assessment follow-ups",
    focus: "Bytarayanapura & Jakkur",
    summary: "Community visit and meeting with collectives. Basic Amenities and welfare rights team meeting with partners. Discussion with CCs on progress and follow-ups.",
    pitstopKeys: ["community_meetings", "collectives_meetings", "all_partner_sl", "data_quality"],
  },
  {
    week: 13, start: "2026-06-29", end: "2026-06-30", type: "Meeting",
    title: "Community meeting, partner meeting, Quarterly Review meeting",
    focus: "Hebbala & Majestic-North",
    summary: "Community visit and meeting with collectives. Basic Amenities and welfare rights team meeting with partners. Meeting and discussion for drinking water.",
    pitstopKeys: ["quarterly_partner", "water_assessment", "community_meetings", "cluster_followup"],
  },
];

export async function GET(req: Request) {
  const session = await auth();
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find Shwetha
  const shwetha = await prisma.user.findFirst({
    where: { name: { contains: "Shwetha" } },
    select: { id: true, name: true, email: true },
  });
  if (!shwetha) return NextResponse.json({ error: "Shwetha not found — check name in DB" }, { status: 404 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const eventsOnly = url.searchParams.get("eventsOnly") === "1";

  // Idempotency check — bypass with ?force=1, or skip goals and only add events with ?eventsOnly=1
  const existing = await prisma.goal.count({ where: { ownerId: shwetha.id, deletedAt: null } });
  if (existing > 0 && !force && !eventsOnly) {
    return NextResponse.json({ message: `Shwetha already has ${existing} goals — skipping. Use ?eventsOnly=1 to just add activities, or ?force=1 to re-seed everything.` });
  }

  const created = { goals: 0, pitstops: 0, checklistItems: 0, planItems: 0, events: 0, eventLinks: 0 };

  // Map from pitstop key → pitstop ID (populated during creation, used when linking events)
  const pitstopIdMap = new Map<PitstopKey, string>();

  // If eventsOnly, load existing pitstop IDs by title match so we can still link
  if (eventsOnly) {
    const existingPitstops = await prisma.pitstop.findMany({
      where: { ownerId: shwetha.id, deletedAt: null },
      select: { id: true, title: true },
    });
    for (const gd of GOALS_DATA) {
      for (const pd of gd.pitstops) {
        const match = existingPitstops.find(p => p.title === pd.title);
        if (match) pitstopIdMap.set(pd.key, match.id);
      }
    }
  }

  // Create goals + pitstops + checklists (skipped if eventsOnly)
  if (!eventsOnly) for (let gi = 0; gi < GOALS_DATA.length; gi++) {
    const gd = GOALS_DATA[gi];
    const goal = await prisma.goal.create({
      data: {
        title: gd.title,
        description: gd.description,
        status: "Active",
        ownerId: shwetha.id,
        targetDate: gd.targetDate,
      },
    });
    created.goals++;

    for (let pi = 0; pi < gd.pitstops.length; pi++) {
      const pd = gd.pitstops[pi];
      const pitstop = await prisma.pitstop.create({
        data: {
          title: pd.title,
          status: "Upcoming",
          goalId: goal.id,
          ownerId: shwetha.id,
          targetDate: pd.targetDate,
          order: pi,
        },
      });
      pitstopIdMap.set(pd.key, pitstop.id);
      created.pitstops++;

      for (let ci = 0; ci < pd.checklist.length; ci++) {
        await prisma.checklistItem.create({
          data: {
            text: pd.checklist[ci],
            pitstopId: pitstop.id,
            checked: false,
            order: ci,
          },
        });
        created.checklistItems++;
      }
    }
  }

  // Create Q1 activities (PitstopEvent — shown in Activities calendar)
  // and PlanItems (shown in Planner)
  for (const act of ACTIVITIES_DATA) {
    const eventType = act.type === "Visit" ? "Visit" : "Meeting";
    const event = await prisma.pitstopEvent.create({
      data: {
        title: `W${act.week}: ${act.title}`,
        description: `Focus: ${act.focus}\n\n${act.summary}`,
        type: eventType as "Visit" | "Meeting" | "Event",
        status: "Scheduled",
        scheduledAt: new Date(act.start),
        endsAt: new Date(act.end),
        createdById: shwetha.id,
      },
    });
    // Add Shwetha as attendee
    await prisma.pitstopEventAttendee.create({
      data: { eventId: event.id, userId: shwetha.id },
    });

    // Link to relevant pitstops
    for (const key of act.pitstopKeys) {
      const pitstopId = pitstopIdMap.get(key);
      if (pitstopId) {
        await prisma.pitstopEventPitstop.create({
          data: { eventId: event.id, pitstopId },
        });
        created.eventLinks++;
      }
    }

    // Also create PlanItem for Planner view
    await prisma.planItem.create({
      data: {
        title: `W${act.week}: ${act.title}`,
        description: `Focus: ${act.focus}\n\n${act.summary}`,
        type: act.type,
        date: new Date(act.start),
        endDate: new Date(act.end),
        userId: shwetha.id,
      },
    });
    created.planItems++;
    created.events++;
  }

  return NextResponse.json({
    success: true,
    user: shwetha,
    created,
  });
}
