/**
 * Rewrite the Youth Resource Centre (`youth-resource-centre`) GoalTemplateDef
 * to mirror the redone Children Learning Centre pattern (8 pitstops, calendarized
 * training, MIS folded into infra, crisis folded into programming).
 *
 * Decisions locked with user 2026-06-05:
 *   • 8 pitstops (down from 12) — see breakdown in commit message
 *   • Single calendarized training pitstop (3-day orientation + 6 monthly trainings)
 *   • Crisis Intervention folded into Thematic Sessions + Documentation
 *   • Parameter renamed `clusters` → `centres`
 *   • dayOffset on early/critical activities only (matches CLC pattern)
 *
 * Existing goals using this template are NOT auto-rewritten — they continue
 * to render against their last-applied pitstops. The /settings/templates UI
 * has a per-goal "sync template" flow that picks up new pitstops/checklists
 * when a goal owner opts in. See lib/templateSync.ts.
 *
 * Usage: node --env-file=.env --env-file=.env.local node_modules/.bin/tsx scripts/redo-yrc-template.ts
 */
import prisma from "../lib/prisma";

type CompletionType = "Activity" | "Voice" | "Upload";
type ProgressTag = "Team" | "Permissions" | "Infrastructure" | "Training" | "Live" | "Baseline" | "Monitoring";
type PitstopType = "SiteVisit" | "Milestone" | "Training" | "Meeting" | "Research" | "Discussion";

type ActivityDef = { key: string; title: string; dayOffset?: number; completionType: CompletionType };
type ChecklistDef = { key: string; text: string; activities: ActivityDef[] };
type PitstopDef = {
  key: string;
  type: PitstopType;
  title: string;
  notes: string;
  startSlaDays: number;
  slaDays: number;
  progressTag: ProgressTag;
  checklist: ChecklistDef[];
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—'"".,!?():/]/g, " ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 12)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build one checklist item with one nested activity. dayOffset optional. */
function ci(text: string, activityTitle: string, completionType: CompletionType, dayOffset?: number): ChecklistDef {
  return {
    key: slugify(text),
    text,
    activities: [{
      key: slugify(activityTitle),
      title: activityTitle,
      ...(dayOffset !== undefined ? { dayOffset } : {}),
      completionType,
    }],
  };
}

// ── Pitstop 1: Team Recruitment & Deployment ─────────────────────────────────
const pitstop1: PitstopDef = {
  key: "team-recruitment-deployment",
  type: "Milestone",
  title: "Team Recruitment & Deployment",
  notes: "Recruit core staff for 2 Youth Resource Centre(s). Required per organisation: 1 Youth Lead (mandatory for ≥2 YRCs), 2 YRC Coordinator(s), 4 Youth Worker(s) from community (2 per YRC). Each Youth Worker reaches 500 youth, engages closely with 200, and develops 20 leaders over the programme. Brief team on local vulnerability context: ~32% dropout after 10th grade, ~63% working by 21, ~28% married before 21. Common patterns to be sensitised on: substance abuse, GBV, early pregnancy, undertrial cases.",
  startSlaDays: 0,
  slaDays: 21,
  progressTag: "Team",
  checklist: [
    ci("Recruit Youth Lead (1 per organisation, mandatory for ≥2 YRCs)", "Youth Lead Recruitment Confirmation", "Activity", 7),
    ci("Recruit 2 YRC Coordinator(s) — graduate, preferably from community", "YRC Coordinator Recruitment Confirmation", "Activity", 10),
    ci("Recruit 4 Youth Worker(s) from community — 2 per YRC", "Youth Worker Recruitment Confirmation", "Activity", 14),
    ci("Map existing community organisers with youth relationship-building track record", "Existing Staff Capability Review", "Activity", 5),
    ci("Conduct team induction: programme objectives, youth vulnerability context, gender lens", "Team Induction Session", "Voice", 18),
    ci("Brief on local patterns: substance abuse, GBV, early pregnancy, undertrial cases", "Vulnerability Context Briefing", "Activity"),
    ci("Assign workers to YRCs and define reporting relationships", "Staff YRC Assignment", "Activity"),
    ci("Set up team communication channels and weekly review rhythm", "Team Communication Setup", "Activity"),
  ],
};

// ── Pitstop 2: YRC Location & Neighbour Sensitisation ────────────────────────
const pitstop2: PitstopDef = {
  key: "yrc-location-neighbour-sensitisation",
  type: "SiteVisit",
  title: "YRC Location & Neighbour Sensitisation",
  notes: "Identify location(s) for 2 YRC(s). Each YRC needs 2–3 rooms and at least 700 sqft — group space, library/reading area, counselling corner. Preferred: close to the community but accessible from the nearest transport point to the slum. Neighbourhood must tolerate evening youth activity — landlord-led neighbour sensitisation is non-negotiable up front. Verify ventilation, lighting, basic structural safety.",
  startSlaDays: 7,
  slaDays: 30,
  progressTag: "Permissions",
  checklist: [
    ci("Shortlist 2–3 candidate locations per YRC — close to community, accessible from transport", "YRC Location Site Visit", "Voice", 5),
    ci("Verify minimum 700 sqft with 2–3 rooms (group space, library/reading area, counselling corner)", "Space Requirements Verification", "Activity", 10),
    ci("Assess neighbourhood: noise tolerance for evening activities is critical", "Neighbourhood Tolerance Assessment", "Activity", 10),
    ci("Sensitise neighbours about programme purpose with support of landlord", "Neighbour Sensitisation Meeting", "Voice", 14),
    ci("Verify adequate ventilation, lighting, and structural safety", "Building Safety Assessment", "Activity", 12),
    ci("Confirm location with cluster coordinator and youth team", "Location Approval Meeting", "Activity", 18),
    ci("Execute rent agreement(s) for 2 YRC location(s)", "YRC Rent Agreement Signing", "Upload", 30),
  ],
};

// ── Pitstop 3: YRC Infrastructure & MIS Setup ────────────────────────────────
const pitstop3: PitstopDef = {
  key: "yrc-infrastructure-mis-setup",
  type: "Milestone",
  title: "YRC Infrastructure & MIS Setup",
  notes: "Set up all 2 YRC(s) in a participatory manner — identified youth from the community must be involved in painting and furnishing. Per YRC: 2 racks for library books, 30 chairs, 2 tables, 1 projector, 1 screen, WiFi, 1 camera, cultural activity corner (instruments + indoor games + art/craft), counselling corner, information bank (schemes + scholarships + helplines + opportunities). Operationalise the Youth MIS alongside physical setup: enrolment, daily/session attendance, scheme tracker, social-action tracker, crisis/referral tracker, leadership cohort tracker.",
  startSlaDays: 21,
  slaDays: 50,
  progressTag: "Infrastructure",
  checklist: [
    ci("Involve identified youth from community in painting and furnishing (participatory setup)", "Participatory Setup Walkthrough", "Voice", 5),
    ci("Procure and install 2 book racks per YRC", "Book Rack Installation", "Activity", 10),
    ci("Procure 30 chairs and 2 tables per YRC", "Furniture Procurement", "Activity", 10),
    ci("Procure 1 projector, 1 screen, camera and assistive gear per YRC", "Tech Equipment Procurement", "Activity", 12),
    ci("Set up WiFi connection", "WiFi Setup Confirmation", "Activity", 15),
    ci("Build library: curate books on health, legal/financial literacy, career, life skills", "Library Curation", "Activity", 18),
    ci("Set up cultural activity corner: musical instruments, indoor board games, art & craft", "Cultural Corner Setup", "Activity"),
    ci("Install information bank notice board: schemes, scholarships, helplines, opportunities", "Information Bank Setup", "Activity"),
    ci("Set up private counselling corner (individual and small-group sessions)", "Counselling Corner Setup", "Activity"),
    ci("Conduct community announcement of YRC opening", "YRC Opening Announcement", "Voice", 25),
    ci("Finalise YRC visiting hours and daily/weekly activity schedule", "Schedule Finalisation", "Upload"),
    ci("Set up Youth MIS — enrolment, attendance, schemes, social action, crisis/referral, leadership trackers", "Youth MIS Setup", "Activity", 30),
  ],
};

// ── Pitstop 4: Staff Orientation & Training Programme (calendarized) ────────
// 3-day residential orientation + 6 monthly trainings (2 days/month) + per-month
// reinforcement weeks. Total window: 6 months from kickoff.
const pitstop4: PitstopDef = {
  key: "staff-orientation-training-programme",
  type: "Training",
  title: "Staff Orientation & Training Programme",
  notes: "All youth workers and YRC coordinators undergo a 3-day residential orientation, followed by 2 days of training per month for 6 months (calendarized). Trainings conducted by internal and external resource persons across monthly themes: SRHR, mental health, legal literacy, financial literacy, constitutional values, digital literacy, substance abuse, career counselling, safe-space facilitation. Each training month includes an apprenticeship/reinforcement week where the coordinator handholds the worker in field application.",
  startSlaDays: 14,
  slaDays: 180,
  progressTag: "Training",
  checklist: [
    ci("3-day residential orientation — Day 1: programme objectives, youth development context, gender & intersectionality", "Orientation Day 1", "Voice", 5),
    ci("3-day residential orientation — Day 2: safe space facilitation, counselling basics, crisis identification", "Orientation Day 2", "Activity", 6),
    ci("3-day residential orientation — Day 3: YRC operations, outreach methods, documentation, MIS app", "Orientation Day 3", "Activity", 7),
    ci("Finalise 6-month monthly training calendar (2 days/month) with internal and external RPs", "Training Calendar Finalisation", "Upload", 10),
    ci("Identify and onboard external resource persons for specialised sessions", "External RP Onboarding", "Activity", 14),
    ci("Month 1 training (2 days): SRHR + mental health basics", "Month 1 Training", "Voice"),
    ci("Month 1 reinforcement: coordinator handholds worker in field application", "Month 1 Reinforcement", "Activity"),
    ci("Month 2 training (2 days): legal literacy + safe-space facilitation", "Month 2 Training", "Activity"),
    ci("Month 2 reinforcement: coordinator handholds worker in field application", "Month 2 Reinforcement", "Activity"),
    ci("Month 3 training (2 days): financial literacy + scheme navigation", "Month 3 Training", "Activity"),
    ci("Month 3 reinforcement: coordinator handholds worker in field application", "Month 3 Reinforcement", "Activity"),
    ci("Month 4 training (2 days): substance abuse + crisis de-escalation", "Month 4 Training", "Activity"),
    ci("Month 4 reinforcement: coordinator handholds worker in field application", "Month 4 Reinforcement", "Activity"),
    ci("Month 5 training (2 days): constitutional values + GBV response", "Month 5 Training", "Activity"),
    ci("Month 5 reinforcement: coordinator handholds worker in field application", "Month 5 Reinforcement", "Activity"),
    ci("Month 6 training (2 days): digital literacy + career counselling", "Month 6 Training", "Activity"),
    ci("Month 6 reinforcement: coordinator handholds worker in field application", "Month 6 Reinforcement", "Activity"),
  ],
};

// ── Pitstop 5: Youth Enumeration & Baseline Survey ───────────────────────────
const pitstop5: PitstopDef = {
  key: "youth-enumeration-baseline-survey",
  type: "Research",
  title: "Youth Enumeration & Baseline Survey",
  notes: "Enumerate all youth aged 15–21 in each YRC's cluster settlements — target 2000 total across 2 YRC(s). Each Youth Worker eventually engages 200 closely and develops 20 leaders. Separately enumerate 22–30 year olds for need-based support tracking. MIS captures: demographics, education/employment status, dropout reasons, documentation gaps (Aadhaar, voter ID, bank account, ration card, caste/income certificate), scheme access (post-matric, BBMP fee reimbursement, Yuva Spandana, APF), and at-risk indicators (substance abuse, GBV signs, early-marriage risk, trafficking signs, undertrial).",
  startSlaDays: 21,
  slaDays: 60,
  progressTag: "Baseline",
  checklist: [
    ci("Enumerate youth aged 15–21 in all settlements — target 2000 total across 2 YRC(s)", "Door-to-Door Enumeration", "Voice", 10),
    ci("Record demographics: name, gender, DOB, caste, religion, mother tongue, cluster/slum, contact, family details", "Demographic Capture", "Activity", 15),
    ci("Record education/employment status: studying, studying+working, working, homemaker, job-seeking, dropout", "Education and Employment Status Capture", "Activity", 15),
    ci("For dropouts: record reasons (financial, family emergency, marriage, substance use, lack of interest, etc.)", "Dropout Reason Capture", "Activity"),
    ci("Record documentation access: Aadhaar, voter ID, bank account, ration card, caste/income certificate", "Documentation Audit", "Activity", 20),
    ci("Assess scholarship access: post-matric, BBMP fee reimbursement, Yuva Spandana, APF scholarship", "Scholarship Access Audit", "Activity", 25),
    ci("Identify at-risk youth: substance abuse, GBV, early-marriage risk, trafficking signs, undertrial cases", "At-Risk Identification", "Activity", 30),
    ci("Enumerate 22–30 yr olds separately for need-based support tracking", "Adult Cohort Enumeration", "Activity"),
    ci("Enter all baseline data into MIS; assign each worker their 500-youth caseload", "Baseline MIS Entry", "Upload", 60),
  ],
};

// ── Pitstop 6: Small Group Meetings & YRC Activation ─────────────────────────
const pitstop6: PitstopDef = {
  key: "small-group-meetings-yrc-activation",
  type: "Meeting",
  title: "Small Group Meetings & YRC Activation",
  notes: "Youth workers conduct first round of small group meetings in settlements to build rapport, introduce the YRC, and identify interested youth. Build YRC footfall via cultural activities, sports events, and monthly slum-level awareness meetings. From the meetings identify 200 youth per worker for close engagement and 20 per worker for the leadership pipeline. Begin monthly stakeholder cadence (ASHA, police, school, PHC).",
  startSlaDays: 35,
  slaDays: 80,
  progressTag: "Live",
  checklist: [
    ci("Conduct first round of small group meetings per settlement — introduce YRC and programme", "First Small Group Meetings", "Voice", 5),
    ci("Hold awareness meetings at slum level (monthly)", "Monthly Awareness Meeting", "Voice"),
    ci("Set up cultural activities at YRC: musical instruments, indoor games, art & craft (daily/weekly)", "Daily Cultural Activities Launch", "Activity", 10),
    ci("Organise first outdoor sports event or youth cultural programme for broad mobilisation", "First Mobilisation Event", "Voice", 30),
    ci("Identify 200 youth per worker for close engagement", "Close Engagement Cohort Identification", "Activity"),
    ci("Identify 20 youth per worker showing leadership interest (pipeline)", "Leadership Pipeline Identification", "Activity"),
    ci("Track YRC footfall in MIS: new youth, repeat visits (>2 times/month)", "Footfall Tracking Setup", "Activity", 15),
    ci("Document issues and needs raised in small group meetings — feed into activity planning", "Issue Documentation", "Activity"),
    ci("Begin monthly stakeholder meetings with ASHA, police, school, PHC", "Stakeholder Meeting Cadence", "Voice"),
  ],
};

// ── Pitstop 7: Thematic Sessions, Documentation & Crisis Support ─────────────
// Merged: original #7 (Thematic Sessions) + #8 (Documentation/Scheme Linkage)
// + #11 (Crisis Intervention & Referral System).
const pitstop7: PitstopDef = {
  key: "thematic-sessions-documentation-crisis-support",
  type: "Training",
  title: "Thematic Sessions, Documentation & Crisis Support",
  notes: "Three programmatic strands running in parallel at the YRC. (a) Thematic sessions: monthly themed sessions + quarterly Yuva Adda (gender, GBV, constitution, caste, pluralism, environment); 2-day capacity-building workshops for youth in batches. (b) Documentation drive + scheme linkage: review baseline documentation gaps and facilitate Aadhaar/voter ID/bank/ration/caste applications; link eligible youth to NYK, post-matric scholarship, BBMP fee reimbursement (Shulka Marupavathi), Yuva Spandana, APF, NSDC/state skill training. (c) Crisis support: map referral pathways (NIMHANS, psychologists, legal aid, shelter, DV helplines, police) and establish referral protocols for substance abuse, GBV, undertrial, early marriage, trafficking. Train youth workers on basic counselling, crisis de-escalation, and when to refer. Set up peer-to-peer support groups at each YRC.",
  startSlaDays: 45,
  slaDays: 180,
  progressTag: "Live",
  checklist: [
    // Thematic sessions
    ci("Design 2-day capacity-building workshop curriculum for youth", "Workshop Curriculum Design", "Upload", 10),
    ci("Conduct first 2-day workshop — health, hygiene, reproductive health, nutrition", "First Capacity Workshop", "Voice", 25),
    ci("Set monthly thematic session calendar (mental health, legal/financial/digital literacy, constitutional values, substance abuse, career counselling, SRHR)", "Monthly Session Calendar Setup", "Upload", 15),
    ci("Schedule quarterly Yuva Adda (gender, GBV, constitution, caste, pluralism, environment)", "Yuva Adda Calendar Setup", "Upload", 20),
    ci("Set up individual + group counselling availability at YRC", "Counselling Service Launch", "Activity", 30),
    ci("Plan first youth festival / cultural programme", "Youth Festival Planning", "Activity"),
    ci("Raise POCSO awareness in the community", "POCSO Awareness Drive", "Voice"),
    // Documentation + scheme linkage
    ci("Review baseline documentation gaps per youth (Aadhaar, voter ID, bank, ration, caste/income)", "Documentation Gap Review", "Activity", 30),
    ci("Organise documentation camps to address gaps in bulk", "Documentation Camp", "Voice"),
    ci("Register eligible youth with Nehru Yuva Kendra (NYK)", "NYK Registration", "Activity"),
    ci("Facilitate post-matric scholarship applications (SC/ST, minority, general)", "Post-Matric Scholarship Drive", "Activity"),
    ci("Facilitate BBMP fee reimbursement (Shulka Marupavathi) for eligible students", "BBMP Reimbursement Drive", "Activity"),
    ci("Facilitate Yuva Spandana scheme registration", "Yuva Spandana Drive", "Activity"),
    ci("Facilitate APF scholarship applications where applicable", "APF Scholarship Drive", "Activity"),
    ci("Facilitate skill-training enrolment (NSDC, state skill missions, NGO programmes)", "Skill Training Enrolment", "Activity"),
    ci("Facilitate college referral and preparation for interested youth", "College Referral", "Activity"),
    ci("Set up monthly department visit rhythm — youth workers dedicated days for follow-up", "Department Visit Cadence", "Activity"),
    ci("Track scheme application status per youth in MIS", "Scheme MIS Tracker", "Activity"),
    // Crisis support
    ci("Map crisis referral services: NIMHANS, psychologists, legal aid, shelter, DV helplines, police", "Crisis Referral Map", "Upload", 50),
    ci("Establish referral pathway for substance abuse (counselling → professional care → follow-up)", "Substance Referral Pathway", "Upload"),
    ci("Establish referral pathway for GBV / domestic violence (safe reporting → police → legal aid)", "GBV Referral Pathway", "Upload"),
    ci("Establish referral pathway for undertrial / legal cases (legal aid, court accompaniment)", "Legal Referral Pathway", "Upload"),
    ci("Establish referral pathway for potential child marriage and trafficking (identify → escalate → intervene)", "Child Marriage and Trafficking Pathway", "Upload"),
    ci("Train youth workers on basic counselling, crisis de-escalation, and when to refer", "Crisis Training", "Voice"),
    ci("Identify at-risk youth from enumeration and initiate individual engagement plan", "At-Risk Engagement Plan", "Activity"),
    ci("Set up peer-to-peer support group at each YRC", "Peer Support Group Launch", "Activity"),
    ci("Track crisis cases in MIS (type, referral, follow-up status, outcome)", "Crisis MIS Tracker", "Activity"),
  ],
};

// ── Pitstop 8: Youth Leadership & Social Action Programme ───────────────────
// Merged: original #9 (Leadership) + #10 (Youth-Led Social Action).
const pitstop8: PitstopDef = {
  key: "youth-leadership-social-action-programme",
  type: "Training",
  title: "Youth Leadership & Social Action Programme",
  notes: "Develop 80 youth leaders (20 per worker across 2 YRC(s)) through structured leadership training, action research on public institutions (PHC, school, ration shop, SDMC), and peer mentoring. Identify 1–2 youth per YRC as potential future youth workers/mentors. Social action begins after 6–8 months of preparatory engagement (decent footfall + enrolled leadership cohort): youth split into action groups of 5, each worker runs 5–10 programmes. Categories: crisis intervention (escalate child marriage, trafficking, GBV; accompany survivors to police/court; first responder); community building (street plays, wall paintings, film screenings, inter-faith celebrations); youth cadre (coach younger children in sports, peer scholarship/job support); community work (re-enrol dropouts, peer academic support, menstrual product access, tree drives, health camps, public-institution functioning reviews, welfare-scheme surveys, lok adalats / jan sunwai for denied entitlements).",
  startSlaDays: 60,
  slaDays: 240,
  progressTag: "Training",
  checklist: [
    // Leadership cohort + action research
    ci("Confirm 80 youth as leadership cohort (20 per worker)", "Leadership Cohort Confirmation", "Activity", 15),
    ci("Conduct leadership orientation: community development, rights, documentation, gender", "Leadership Orientation", "Voice", 30),
    ci("Assign action research: assess functioning of a public institution (PHC, school, ration shop, SDMC)", "Action Research Assignment", "Activity", 60),
    ci("Support youth in documenting findings and drafting recommendations", "Research Findings Documentation", "Upload"),
    ci("Facilitate youth-led presentation to relevant department official", "Youth-Led Presentation", "Voice"),
    ci("Identify 1–2 youth per YRC as potential future youth workers/mentors", "Future Worker Identification", "Activity"),
    ci("Coach youth leaders: scholarship support for peers, sports coaching, academic peer support", "Leader Coaching", "Activity"),
    ci("Plan and conduct exposure visit for youth leaders", "Exposure Visit", "Voice"),
    // Social action launch
    ci("Confirm YRC readiness: 6–8 months of operations, decent footfall, enrolled leadership cohort", "Social Action Readiness Confirmation", "Activity", 180),
    ci("Divide active youth into action groups of 5", "Action Group Formation", "Activity"),
    ci("Each worker identifies 5–10 social action programmes from the categories", "Programme Identification", "Upload"),
    // Programme execution by category
    ci("Crisis intervention: identify and escalate child marriage, trafficking signs, GBV cases", "Crisis Intervention Action", "Voice"),
    ci("Crisis intervention: accompany survivors to police/court; first responder for GBV", "Crisis Accompaniment Action", "Voice"),
    ci("Community building: street plays, wall paintings, film screenings, inter-faith celebrations", "Community Building Action", "Voice"),
    ci("Youth cadre: coach younger children in sports; peer scholarship and job applications support", "Youth Cadre Action", "Voice"),
    ci("Community work: re-enrol dropout students; academic peer support; peer counselling", "Education and Peer Support Action", "Activity"),
    ci("Community work: menstrual product access; tree plantation drives; organise health camps", "Health and Environment Action", "Voice"),
    ci("Community work: review school/SDMC/PHC functioning → take action (meetings, escalations, appeals)", "Institution Review Action", "Activity"),
    ci("Community work: conduct welfare-scheme surveys (PDS, pensions, UDID, caste certificates)", "Welfare Scheme Survey", "Voice"),
    ci("Community work: organise lok adalats / jan sunwai if entitlements are denied", "Lok Adalat and Jan Sunwai Action", "Voice"),
    ci("Document outcomes of each social action programme in MIS", "Social Action Outcome Tracking", "Activity"),
    ci("Felicitate outstanding leaders at annual youth festival", "Annual Felicitation", "Voice"),
  ],
};

const pitstops: PitstopDef[] = [pitstop1, pitstop2, pitstop3, pitstop4, pitstop5, pitstop6, pitstop7, pitstop8];

async function main() {
  // Sanity log of slugs to ensure nothing collides.
  const allKeys = new Set<string>();
  for (const p of pitstops) {
    if (allKeys.has(p.key)) throw new Error(`Duplicate pitstop key: ${p.key}`);
    allKeys.add(p.key);
    const ciKeys = new Set<string>();
    for (const c of p.checklist) {
      if (ciKeys.has(c.key)) throw new Error(`Duplicate checklist key in ${p.key}: ${c.key}`);
      ciKeys.add(c.key);
      const actKeys = new Set<string>();
      for (const a of c.activities) {
        if (actKeys.has(a.key)) throw new Error(`Duplicate activity key in ${p.key}/${c.key}: ${a.key}`);
        actKeys.add(a.key);
      }
    }
  }
  console.log(`✓ ${pitstops.length} pitstops, ${pitstops.reduce((n, p) => n + p.checklist.length, 0)} checklist items, ${pitstops.reduce((n, p) => n + p.checklist.reduce((m, c) => m + c.activities.length, 0), 0)} activities — no key collisions.`);

  const current = await prisma.goalTemplateDef.findUnique({ where: { slug: "youth-resource-centre" } });
  if (!current) throw new Error("youth-resource-centre template not found");
  console.log(`Current pitstops: ${(current.pitstops as unknown[]).length} → new: ${pitstops.length}`);

  const newParameters = [
    { key: "centres", label: "Number of YRCs", type: "number" },
  ];

  await prisma.goalTemplateDef.update({
    where: { slug: "youth-resource-centre" },
    data: {
      // Description polished + parameter rename. Pitstops fully replaced.
      description: "Setup and operations for Youth Resource Centres (YRC) serving youth aged 15–21. Covers team recruitment, YRC setup, enumeration & baseline, group mobilisation, 6-month staff training, thematic sessions + scheme linkage + crisis support, and leadership programme leading to youth-led social action.",
      parameters: newParameters,
      pitstops: pitstops as unknown as object,
    },
  });

  console.log("✓ youth-resource-centre updated.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
