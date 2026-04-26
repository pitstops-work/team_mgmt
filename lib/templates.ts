// ── Goal Template definitions ─────────────────────────────────────────────────
// Templates are defined in code. Each template can produce a goal + pitstops
// when applied. Some pitstops scale based on input parameters (e.g. # creches).

export interface ChecklistItemTemplate {
  text: string;
  activityTitle?: string; // if set, this checklist item triggers a schedulable RP activity
  completionType?: string; // 'Activity' | 'Voice' | 'Upload' — default Activity
}

export interface PitstopTemplate {
  title: string;
  type: string;
  notes: string;
  slaDays: number;         // target date = goal start + slaDays
  startSlaDays: number;    // start date = goal start + startSlaDays
  recurrence?: "None" | "Weekly" | "Monthly" | "Quarterly";
  checklist: ChecklistItemTemplate[];
  progressTag?: string;    // Team | Baseline | Permissions | Infrastructure | Monitoring | Training | Live
}

export type ProgressTag = "Team" | "Baseline" | "Permissions" | "Infrastructure" | "Monitoring" | "Training" | "Live";

export const PROGRESS_TAGS: ProgressTag[] = [
  "Team", "Baseline", "Permissions", "Infrastructure", "Monitoring", "Training", "Live",
];

// Ordered: more specific first. First match wins. Default → Live.
const TAG_KEYWORDS: [ProgressTag, string[]][] = [
  ["Team",           ["recruitment", "hiring", "deployment", "induction", "programme team", "staffing"]],
  ["Baseline",       ["survey", "mapping", "enumeration", "line listing", "linelisting", "baseline", "needs assessment", "demand estimation"]],
  ["Permissions",    ["gram sabha", "mou", "approval", "noc", "liaison", "government", "sensitisation", "stakeholder"]],
  ["Infrastructure", ["infrastructure", "civil works", "procurement", "facility", "mobile app", "mis", "rent", "books", "tlm", "location"]],
  ["Monitoring",     ["monitoring", "review", "supervision", "rounds", "visit", "cadence", "tracking", "audit"]],
  ["Training",       ["training", "orientation", "coaching", "capacity building", "leadership", "peer learning", "learning"]],
  ["Live",           ["launch", "enrollment", "activation", "drive", "linkage", "rollout", "placement", "formation", "operations", "session", "action"]],
];

export function applyProgressTags(pitstops: PitstopTemplate[]): PitstopTemplate[] {
  return pitstops.map((pt) => {
    if (pt.progressTag) return pt;
    const lower = pt.title.toLowerCase();
    for (const [tag, keywords] of TAG_KEYWORDS) {
      if (keywords.some((k) => lower.includes(k))) return { ...pt, progressTag: tag };
    }
    return { ...pt, progressTag: "Live" };
  });
}

export interface GoalTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  needsDomain?: string;  // links this template to a NeedsFormulaConfig domain key
  parameters: TemplateParameter[];
  build: (params: Record<string, string | number>) => PitstopTemplate[];
}

export interface TemplateParameter {
  key: string;
  label: string;
  type: "number" | "text" | "choice";
  min?: number;
  max?: number;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

// ── Creche Program Template ───────────────────────────────────────────────────

function buildCrecheTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const n = Number(params.creches) || 1;
  const track = String(params.track || "new");
  const trainingBatches = Math.ceil((n * 2) / 24);   // 2 caregivers per creche, 24 per batch
  const facilityClusters = Math.ceil(n / 10);         // 10 creches per supervisor cluster
  const needsSafetyCoord = n >= 40;

  if (track === "existing") {
    return [
      {
        title: "Monthly Creche Rounds",
        type: "SiteVisit",
        recurrence: "Monthly",
        notes: `RP visits all ${n} creche(s) monthly (~2 hours per creche). Observe caregiver conduct, review child nutrition records, check hygiene and safety standards, and flag issues to supervisor immediately.`,
        startSlaDays: 0,
        slaDays: 30,
        checklist: [
          { text: `All ${n} creche(s) visited this month`, activityTitle: "Monthly Creche Round Visit", },
          { text: "Caregiver conduct observed in each creche", activityTitle: "Caregiver Conduct Observation", completionType: "Voice" },
          { text: "Child nutrition records reviewed", activityTitle: "Child Nutrition Records Review" },
          { text: "Hygiene and safety standards checked against 24-point checklist", activityTitle: "Hygiene and Safety Standards Check" },
          { text: "Attendance register and child card records reviewed", activityTitle: "Attendance and Child Card Review" },
          { text: "Growth monitoring data spot-checked (weight/height records up to date)", activityTitle: "Growth Monitoring Data Check" },
          { text: "IFA supplementation tracking verified", activityTitle: "IFA Supplementation Verification" },
          { text: "Issues flagged to supervisor immediately", activityTitle: "Supervisor Issue Escalation" },
          { text: "Creche visit log updated", activityTitle: "Creche Visit Log Update" },
        ],
      },
      {
        title: "Creche Supervisor Review",
        type: "Meeting",
        recurrence: "Monthly",
        notes: "Monthly review with creche supervisors. Discuss rounds findings, address caregiver performance issues, and review expansion pipeline.",
        startSlaDays: 0,
        slaDays: 30,
        checklist: [
          { text: "All supervisors present", activityTitle: "Creche Supervisor Review Meeting" },
          { text: "Monthly rounds findings discussed per creche", activityTitle: "Rounds Findings Discussion", completionType: "Voice" },
          { text: "Caregiver performance issues identified and action owners assigned", activityTitle: "Caregiver Performance Review" },
          { text: "MIS data (Shishughar) cross-checked with field register data", activityTitle: "MIS vs Register Data Check" },
          { text: "Expansion / new creche pipeline reviewed against needs gap", activityTitle: "Expansion Pipeline Review" },
          { text: "In-service training calendar for next month confirmed", activityTitle: "Monthly Training Calendar Confirmation" },
          { text: "Action items documented and shared", activityTitle: "Action Items Documentation" },
        ],
      },
    ];
  }

  const pitstops: PitstopTemplate[] = [
    {
      title: "Team Recruitment & Induction",
      type: "Training",
      notes: `Recruit and induct core program team. For ${n} creches you will need: 1 Program Manager, ${Math.ceil(n / 40)} Cluster Coordinator(s), ${Math.ceil(n / 10)} Creche Supervisor(s)${needsSafetyCoord ? ", 1 Safety Coordinator" : ""}, 1 Training Coordinator, 1 Logistics Coordinator, 1 MIS Coordinator.`,
      startSlaDays: 0,
      slaDays: 14,
      checklist: [
        { text: "Recruit Program Manager", activityTitle: "Programme Manager Recruitment" },
        { text: "Recruit Training Coordinator", activityTitle: "Training Coordinator Recruitment" },
        { text: "Recruit Logistics Coordinator", activityTitle: "Logistics Coordinator Recruitment" },
        { text: "Recruit MIS Coordinator", activityTitle: "MIS Coordinator Recruitment" },
        { text: `Recruit ${Math.ceil(n / 40)} Cluster Coordinator(s)`, activityTitle: "Cluster Coordinator Recruitment" },
        { text: `Recruit ${Math.ceil(n / 10)} Creche Supervisor(s)`, activityTitle: "Creche Supervisor Recruitment" },
        ...(needsSafetyCoord ? [{ text: "Recruit Safety Coordinator (required for 40+ creches)", activityTitle: "Safety Coordinator Recruitment" }] : []),
        { text: "Conduct team induction and orientation", activityTitle: "Team Induction & Orientation", completionType: "Voice" },
        { text: "Set up team communication channels", activityTitle: "Team Communication Setup" },
      ],
    },
    {
      title: "Government Liaison & Approvals",
      type: "Meeting",
      notes: "Establish formal relationship with district authorities. All outreach must be done under Program Officer guidance.",
      startSlaDays: 7,
      slaDays: 21,
      checklist: [
        { text: "Submit formal letter to District Collector", activityTitle: "District Collector Letter Submission", completionType: "Upload" },
        { text: "Distribute letter to CDPO, DPO, BDO, and Block Health Officer", activityTitle: "Govt Officials Letter Distribution" },
        { text: "Meet with District/Block officials to explain program", activityTitle: "Government Officials Meeting" },
        { text: "Obtain necessary approvals or NOCs", activityTitle: "NOC and Approvals Collection" },
        { text: "Collect secondary demographic data (0-3 year olds in target area)", activityTitle: "Demographic Data Collection" },
        { text: "Identify vulnerable/priority populations", activityTitle: "Vulnerable Population Identification" },
      ],
    },
    {
      title: "Village Identification & Line Listing",
      type: "Research",
      notes: `Identify and confirm ${n} target villages/locations for creche placement. Each creche serves 15-20 children from a single village.`,
      startSlaDays: 14,
      slaDays: 30,
      checklist: [
        { text: "Analyse secondary data to shortlist villages", activityTitle: "Village Shortlisting Analysis" },
        { text: "Conduct field visits to shortlisted villages", activityTitle: "Village Field Visits", completionType: "Voice" },
        { text: `Confirm ${n} villages meeting eligibility criteria`, activityTitle: "Village Eligibility Confirmation" },
        { text: "Conduct line listing of all 0-3 year olds in each village", activityTitle: "Under-3 Line Listing Survey" },
        { text: "Document household enumeration data", activityTitle: "Household Data Documentation" },
        { text: "Enter data into Shishughar MIS", activityTitle: "Shishughar MIS Data Entry" },
      ],
    },
    {
      title: "Gram Sabha & Community Engagement",
      type: "Meeting",
      notes: "Conduct community meetings in each village to introduce the program, build trust, and identify caregivers. Gram Sabha must include all community adults.",
      startSlaDays: 21,
      slaDays: 45,
      checklist: [
        { text: "Schedule and conduct Gram Sabha in each village", activityTitle: "Gram Sabha Meetings", completionType: "Voice" },
        { text: "Explain creche program, benefits, and difference from Anganwadi", activityTitle: "Creche Programme Awareness Session" },
        { text: "Discuss caregiver roles, responsibilities, and stipend", activityTitle: "Caregiver Role Orientation", completionType: "Voice" },
        { text: "Identify 2-3 potential caregiver candidates with community nomination", activityTitle: "Caregiver Candidate Identification" },
        { text: "Explain Creche Management Committee (CMC) concept", activityTitle: "CMC Concept Introduction" },
        { text: "Address community concerns and questions", activityTitle: "Community Q&A Session" },
        { text: "Document meeting minutes and attendance", activityTitle: "Gram Sabha Minutes Documentation", completionType: "Upload" },
      ],
    },
    {
      title: "Caregiver Selection",
      type: "Review",
      notes: `Select 2 caregivers per creche (${n * 2} total). Must be from the same village, trusted by community, ideally from vulnerable backgrounds. At least one must be literate.`,
      startSlaDays: 30,
      slaDays: 50,
      checklist: [
        { text: "Shortlist candidates using 10-point assessment criteria", activityTitle: "Caregiver Shortlisting Assessment" },
        { text: "Verify: prior child care experience, physical capability, willingness to learn", activityTitle: "Candidate Capability Verification" },
        { text: "Verify: community trust and standing", activityTitle: "Community Trust Verification" },
        { text: "Verify: representation from multiple hamlets in village", activityTitle: "Hamlet Representation Check" },
        { text: "Verify: at least one candidate is literate", activityTitle: "Literacy Verification" },
        { text: "Prioritise economically/socially vulnerable candidates", activityTitle: "Vulnerable Candidate Prioritisation" },
        { text: "Avoid candidates from affluent backgrounds", activityTitle: "Background Screening" },
        { text: `Finalise ${n * 2} caregivers (2 per creche)`, activityTitle: "Caregiver Final Selection" },
        { text: "Conduct background check and collect documents", activityTitle: "Caregiver Document Collection" },
        { text: "Form Creche Management Committee (CMC) with parents and community", activityTitle: "CMC Formation Meeting", completionType: "Voice" },
      ],
    },
    {
      title: "Facility Selection & Preparation",
      type: "SiteVisit",
      notes: `Identify and prepare facilities for all ${n} creches. Each facility must be centrally located, have piped water, electricity, and a functional toilet. Execute rent agreements.`,
      startSlaDays: 35,
      slaDays: 60,
      checklist: [
        { text: "Identify facility meeting safety criteria in each village", activityTitle: "Facility Site Visits", completionType: "Voice" },
        { text: "Verify: central location, piped water, electricity, functional toilet", activityTitle: "Facility Standards Verification" },
        { text: "Execute rent agreement for each facility", activityTitle: "Facility Rent Agreement Signing", completionType: "Upload" },
        { text: "Install/repair toilets if needed", activityTitle: "Toilet Repair and Installation" },
        { text: "Set up LPG/smokeless chulha and kitchen area", activityTitle: "Kitchen Area Setup" },
        { text: "Arrange water purification system (boil + filter)", activityTitle: "Water Purification Setup" },
        { text: "Install safety gates to separate kitchen from play area", activityTitle: "Safety Gate Installation" },
        { text: "Set up fencing and safe outdoor play area", activityTitle: "Outdoor Play Area Setup" },
        { text: "Arrange for fans, lights, and ventilation", activityTitle: "Electrical Fixtures Setup" },
        { text: "Install signage and collateral materials", activityTitle: "Signage Installation" },
      ],
    },
    {
      title: "Procurement & Infrastructure Setup",
      type: "Budgeting",
      notes: `Procure all one-time and recurring supplies for ${n} creches. Logistics Coordinator leads procurement. LPG must be under commercial account in organisation name. Maintain 1 extra LPG cylinder per 10-creche cluster.`,
      startSlaDays: 40,
      slaDays: 65,
      checklist: [
        { text: "Identify and approve vendors (pre-approved list for equipment, local for groceries)", activityTitle: "Vendor Identification and Approval" },
        { text: "Procure weighing scales and infantometers/stadiometers", activityTitle: "Measurement Equipment Procurement" },
        { text: "Procure cooking equipment (pressure cookers, vessels, storage containers)", activityTitle: "Kitchen Equipment Procurement" },
        { text: `Procure fire safety equipment (${n} extinguishers, fire blankets, sand buckets)`, activityTitle: "Fire Safety Equipment Procurement" },
        { text: "Procure first-aid boxes and stock with required supplies", activityTitle: "First Aid Kit Procurement" },
        { text: "Procure mattresses, blankets, and mosquito nets", activityTitle: "Bedding and Netting Procurement" },
        { text: "Procure play materials and age-appropriate toys (10+ types)", activityTitle: "Play Materials Procurement" },
        { text: `Set up LPG commercial accounts (${n} cylinders + ${facilityClusters} spares)`, activityTitle: "LPG Commercial Account Setup" },
        { text: "Procure registers (all 8 types) for each creche", activityTitle: "Register Procurement" },
        { text: "Procure opening stock of food (rice, dal, oil, jaggery, vegetables)", activityTitle: "Initial Food Stock Procurement" },
        { text: "Document all procurement in stock register", activityTitle: "Procurement Stock Documentation", completionType: "Upload" },
      ],
    },
    ...Array.from({ length: trainingBatches }, (_, i) => ({
      title: `Pre-Service Training — Batch ${i + 1}${trainingBatches > 1 ? ` of ${trainingBatches}` : ""}`,
      type: "Training",
      notes: `5-day residential training for caregivers. Batch ${i + 1}: ${Math.min(24, n * 2 - i * 24)} caregivers. Max 24 per batch. Requires 2 facilitators, sample creche setup, and childcare for trainees' children.`,
      startSlaDays: 60 + i * 7,
      slaDays: 75 + i * 7,
      checklist: [
        { text: "Book residential training venue", activityTitle: "Training Venue Booking" },
        { text: "Arrange childcare for trainees' own children during training", activityTitle: "Trainee Childcare Arrangement" },
        { text: "Prepare sample creche setup at training venue", activityTitle: "Sample Creche Setup" },
        { text: "Day 1: Exposure visit to an operational creche", activityTitle: "Pre-Service Caregiver Training", completionType: "Voice" },
        { text: "Day 2: Context, child needs, caregiver roles, safety protocols", activityTitle: "Training Day 2: Child Care Fundamentals", completionType: "Voice" },
        { text: "Day 3: Food storage, water, egg handling, cooking demos, feeding practices", activityTitle: "Training Day 3: Nutrition and Feeding", completionType: "Voice" },
        { text: "Day 4: Child care, hygiene, engagement activities, first aid demo", activityTitle: "Training Day 4: Hygiene and Engagement", completionType: "Voice" },
        { text: "Day 5: Operations, registers, fire safety demonstration", activityTitle: "Training Day 5: Operations and Safety", completionType: "Voice" },
        { text: "Conduct competency assessment of all trainees", activityTitle: "Trainee Competency Assessment" },
        { text: "Distribute training materials and registers to each caregiver", activityTitle: "Training Materials Distribution" },
      ],
    })),
    {
      title: "Operations Launch — Child Enrollment",
      type: "Meeting",
      notes: `Launch all ${n} creches and begin child enrollment. Target 15-20 children per creche. Enroll each child in Shishughar app and complete child cards.`,
      startSlaDays: 75 + (trainingBatches - 1) * 7,
      slaDays: 90 + (trainingBatches - 1) * 7,
      checklist: [
        { text: "Confirm facility readiness (safety checklist — 24 points)", activityTitle: "Facility Readiness Safety Check" },
        { text: "Conduct pre-opening community meeting and announce start date", activityTitle: "Creche Launch Community Meeting" },
        { text: "Enroll children (name, age, gender, health history, emergency contacts)", activityTitle: "Child Enrollment Registration" },
        { text: "Obtain consent for growth monitoring and photography", activityTitle: "Parental Consent Collection" },
        { text: "Register each child in Shishughar app and child card", activityTitle: "Child MIS Registration" },
        { text: "Conduct baseline weight and height measurement for all enrolled children", activityTitle: "Baseline Growth Measurement" },
        { text: "Brief parents on daily schedule (8:30 AM - 3:30 PM) and nutrition", activityTitle: "Parent Orientation Briefing", completionType: "Voice" },
        { text: "Conduct first CMC meeting", activityTitle: "First CMC Meeting", completionType: "Voice" },
        { text: "Verify all 8 registers are set up and ready", activityTitle: "Register Setup Verification" },
      ],
    },
    {
      title: "Growth Monitoring & Health Linking Setup",
      type: "Review",
      notes: "Establish the monthly growth monitoring cycle and link with local health system (ANMs, AWW, ASHA). Set up equipment calibration schedule.",
      startSlaDays: 85 + (trainingBatches - 1) * 7,
      slaDays: 100 + (trainingBatches - 1) * 7,
      checklist: [
        { text: "Train caregivers on weight measurement (tray method for <2 years)", activityTitle: "Weight Measurement Training", completionType: "Voice" },
        { text: "Train caregivers on height/length measurement (infantometer vs stadiometer)", activityTitle: "Height Measurement Training", completionType: "Voice" },
        { text: "Calibrate all weighing scales and measurement equipment", activityTitle: "Equipment Calibration" },
        { text: "Set quarterly calibration schedule (January, April, July, October)", activityTitle: "Calibration Schedule Setup" },
        { text: "Establish contact with local ANM, AWW, and ASHA workers", activityTitle: "Health System Coordination Meeting" },
        { text: "Map immunisation due dates for all enrolled children in Shishughar", activityTitle: "Immunisation Schedule Mapping" },
        { text: "Set up IFA supplementation tracking (bi-weekly for 6-59 months)", activityTitle: "IFA Tracking Setup" },
        { text: "Establish referral pathway to PHC/CHC", activityTitle: "PHC Referral Pathway Setup" },
        { text: "Brief caregivers on Category A/B/C health alert protocols", activityTitle: "Health Alert Protocol Briefing" },
      ],
    },
    {
      title: "Supervision & Capacity Building Cadence",
      type: "Training",
      notes: `Establish ongoing supportive supervision system. Each supervisor covers 10 creches. Monthly support visits with demonstrations are non-negotiable.`,
      startSlaDays: 90 + (trainingBatches - 1) * 7,
      slaDays: 110 + (trainingBatches - 1) * 7,
      checklist: [
        { text: `Schedule monthly supervisor visit roster for all ${n} creches`, activityTitle: "Supervisor Visit Roster Setup" },
        { text: "Define in-service training calendar for caregivers", activityTitle: "In-Service Training Calendar Setup" },
        { text: "Set up monthly CMC meeting schedule for all creches", activityTitle: "CMC Meeting Schedule Setup" },
        { text: "Schedule quarterly safety audits", activityTitle: "Quarterly Safety Audit Scheduling" },
        { text: "Establish Prabhaat Feri and Nukkad Natak community engagement schedule", activityTitle: "Community Engagement Calendar Setup" },
        { text: "Plan bi-annual Measurement Day celebration", activityTitle: "Measurement Day Planning" },
        { text: "Set up MIS reporting cadence in Shishughar app", activityTitle: "MIS Reporting Cadence Setup" },
        { text: "Conduct first round of supportive supervision visits", activityTitle: "First Supervision Round Visits", completionType: "Voice" },
        { text: "Document and share learnings from first month of operations", activityTitle: "First Month Learning Documentation" },
      ],
    },
  ];

  return pitstops;
}

// ── Welfare Rights Programme Template ────────────────────────────────────────

function buildWelfareRightsTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const clusters = Number(params.clusters) || 1;
  const hhPerCluster = 5500;                             // avg 5,000–6,000 HH per cluster
  const totalHH = clusters * hhPerCluster;
  const totalCOs = clusters * 2;                         // 2 COs per cluster
  const coTrainingBatches = Math.ceil(totalCOs / 20);    // ~20 per training batch
  const totalMASGroups = Math.ceil(totalHH / 300);       // 1 MAS per 300 HH
  const totalCommunityGroups = Math.ceil(totalHH / 500); // 1 group per ~500 HH
  const totalSettlements = clusters * 7;                 // avg 7 settlements per cluster

  return [
    {
      title: "Team Recruitment & Deployment",
      type: "Milestone",
      notes: `Recruit and deploy the full programme team for ${clusters} cluster(s) (~${totalHH.toLocaleString()} HH total). Required: 1 Programme Manager, ${clusters} Cluster Coordinator(s), ${clusters} Resource Centre Coordinator(s), 1 MIS Coordinator, ${totalCOs} Community Organizer(s) (2 per cluster, covering ~5,000–6,000 HH each). COs must be from the community with no prior experience required — only interest and openness to learn.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        { text: "Recruit Programme Manager (1 overall)", activityTitle: "Programme Manager Recruitment" },
        { text: `Recruit ${clusters} Cluster Coordinator(s) (1 per cluster)`, activityTitle: "Cluster Coordinator Recruitment" },
        { text: `Recruit ${clusters} Resource Centre Coordinator(s) (1 per cluster RCC)`, activityTitle: "Resource Centre Coordinator Recruitment" },
        { text: "Recruit MIS Coordinator (1 overall)", activityTitle: "MIS Coordinator Recruitment" },
        { text: `Recruit ${totalCOs} Community Organizers (2 per cluster, from community)`, activityTitle: "Community Organizer Recruitment" },
        { text: "Conduct team induction and orientation session", activityTitle: "Team Induction Session", completionType: "Voice" },
        { text: "Map existing COs — assess interests, capacity, entitlement experience, stakeholder relationships", activityTitle: "Existing CO Capability Assessment" },
        { text: "Assign COs to clusters and settlements", activityTitle: "CO Cluster Assignment" },
        { text: "Set up team communication channels and review cadence", activityTitle: "Team Communication Setup" },
      ],
    },
    {
      title: "Cluster & Settlement Mapping",
      type: "Research",
      notes: `Map all ${clusters} cluster(s) covering approx. ${totalHH.toLocaleString()} households across ${totalSettlements} settlements. Each cluster has 6-8 settlements and ~5,000 households. Identify existing community groups (active/inactive), MAS groups, and locate relevant government infrastructure.`,
      startSlaDays: 7,
      slaDays: 35,
      checklist: [
        { text: `Delineate ${clusters} cluster boundary/boundaries with ward/block boundaries`, activityTitle: "Cluster Boundary Mapping" },
        { text: `List all ${totalSettlements} settlements (approx.) in intervention area`, activityTitle: "Settlement Listing" },
        { text: "Enumerate household count per settlement", activityTitle: "Household Count Survey", completionType: "Voice" },
        { text: "Identify existing community groups (active, inactive, or absent) per settlement", activityTitle: "Community Group Inventory" },
        { text: "Map existing Mahila Arogya Samiti (MAS) groups per settlement", activityTitle: "MAS Group Mapping" },
        { text: "Locate PHC, Anganwadi, government schools, police station per cluster", activityTitle: "Government Infrastructure Mapping" },
        { text: "Identify key community leaders and influencers in each settlement", activityTitle: "Settlement Mapping Visit" },
        { text: "Document findings in cluster planning sheet and share with team", activityTitle: "Cluster Planning Documentation" },
      ],
    },
    {
      title: "CO Orientation Training",
      type: "Training",
      notes: `Conduct 3-day orientation for all ${totalCOs} Community Organizers in batches of up to 20. Covers programme objectives, community organising, civic amenities, MAS, stakeholder engagement, mobile app for mapping and MIS, and the monthly training calendar for Year 1.`,
      startSlaDays: 14,
      slaDays: 45,
      checklist: [
        ...Array.from({ length: coTrainingBatches }, (_, i) => ({
          text: `Batch ${i + 1}: 3-day orientation for COs ${i * 20 + 1}–${Math.min((i + 1) * 20, totalCOs)}`,
          activityTitle: `CO Orientation Batch ${i + 1}`,
        })),
        { text: "Day 1 content: Programme objectives, community group formation, roles & responsibilities", activityTitle: "CO Orientation Training", completionType: "Voice" },
        { text: "Day 2 content: Civic amenities baseline — categories, mapping tool, mobile app", activityTitle: "CO Training Day 2: Civic Amenities Mapping", completionType: "Voice" },
        { text: "Day 3 content: MAS, Bal Raksha Samiti, SDMC, entitlements, stakeholder engagement", activityTitle: "CO Training Day 3: MAS and Entitlements", completionType: "Voice" },
        { text: "Distribute mapping tools, registers, and mobile app access to all COs", activityTitle: "CO Tools and App Distribution" },
        { text: "Share Year 1 monthly training calendar with all COs", activityTitle: "Year 1 Training Calendar Sharing" },
      ],
    },
    {
      title: "Community Group Formation & Activation",
      type: "Meeting",
      notes: `Form or activate community groups across all ${totalSettlements} settlements. Target: 1 group per ~500 HH (approx. ${totalCommunityGroups} groups total), 20 members each. Ensure representation of women, parents of school-going children, and across age groups. Each group needs a regular meeting space.`,
      startSlaDays: 30,
      slaDays: 75,
      checklist: [
        { text: "Review existing groups from mapping — categorise as active, inactive, or absent", activityTitle: "Existing Community Group Review" },
        { text: "For inactive groups: re-engage identified leaders and conduct revival meeting", activityTitle: "Inactive Group Revival Meeting", completionType: "Voice" },
        { text: "For settlements without groups: identify interested members with CO support", activityTitle: "New Group Member Identification" },
        { text: "Ensure group composition: women participation, parents of school-going children, cross-age", activityTitle: "Group Composition Verification" },
        { text: `Form/activate approx. ${totalCommunityGroups} community groups across all settlements`, activityTitle: "Community Group Activation" },
        { text: "Identify and confirm meeting space for each group", activityTitle: "Group Meeting Space Confirmation" },
        { text: "Conduct initial meeting for each group: objectives, roles & responsibilities, monthly schedule", activityTitle: "Community Group Formation Meeting", completionType: "Voice" },
        { text: "Introduce civic amenities baseline concept to each group", activityTitle: "Civic Amenities Concept Introduction" },
        { text: "Identify 2-3 group leaders per community group", activityTitle: "Community Group Leader Identification" },
        { text: "Document group roster, meeting schedule, and leader contacts in MIS", activityTitle: "Group Roster Documentation" },
      ],
    },
    {
      title: "Mahila Arogya Samiti (MAS) Setup",
      type: "Meeting",
      notes: `Form or strengthen MAS groups — 1 per 300 households (approx. ${totalMASGroups} groups total). Work with ASHA to form groups where absent. Link each MAS with the local PHC and identify 5 priority health issues per group. Also initiate Bal Raksha Samiti and Vigilance Committee formation as conditions allow.`,
      startSlaDays: 35,
      slaDays: 80,
      checklist: [
        { text: "Map all existing MAS groups with CO support", activityTitle: "Existing MAS Group Mapping" },
        { text: `Identify gaps — target total of ${totalMASGroups} MAS groups across ${clusters} cluster(s)`, activityTitle: "MAS Coverage Gap Analysis" },
        { text: "Work with ASHA workers to form MAS where none exist (1 per 300 HH)", activityTitle: "ASHA Partnership for MAS Formation" },
        { text: "Conduct first MAS meeting in each settlement — introduce programme and roles", activityTitle: "MAS Formation Meeting", completionType: "Voice" },
        { text: "Link each MAS group with local PHC/Medical Officer", activityTitle: "MAS–PHC Linkage Meeting" },
        { text: "Facilitate identification of 5 priority health issues per MAS group", activityTitle: "Priority Health Issue Identification" },
        { text: "Begin Bal Raksha Samiti formation in settlements with school-going children", activityTitle: "Bal Raksha Samiti Formation" },
        { text: "Begin Vigilance Committee formation as relevant issues are identified", activityTitle: "Vigilance Committee Formation" },
        { text: "Register MAS groups and meeting cadence in MIS", activityTitle: "MAS MIS Registration" },
      ],
    },
    {
      title: "Civic Amenities Baseline Mapping",
      type: "Research",
      notes: `Conduct a structured baseline mapping of 7 civic amenity categories across all ${totalSettlements} settlements. Use the mobile application and mapping tool. COs work alongside community members in this exercise. Output: settlement-level data on access to toilets, water, drainage, waste collection, streetlights, CCTV, and other issues.`,
      startSlaDays: 45,
      slaDays: 90,
      checklist: [
        { text: "Complete CO training on mapping tool and mobile application", activityTitle: "CO Mapping Tool Training", completionType: "Voice" },
        { text: "Map: access to public toilets (availability, functionality, gender-segregated)", activityTitle: "Toilet Access Mapping" },
        { text: "Map: access to regular drinking water supply", activityTitle: "Water Access Mapping" },
        { text: "Map: drainage and sewer line coverage", activityTitle: "Drainage System Mapping" },
        { text: "Map: waste collection frequency and coverage (BBMP or equivalent)", activityTitle: "Waste Collection Mapping" },
        { text: "Map: adequacy of streetlights", activityTitle: "Streetlight Adequacy Mapping" },
        { text: "Map: CCTV coverage in blind spots / unsafe areas", activityTitle: "CCTV Coverage Mapping" },
        { text: "Map: other settlement-specific civic issues identified by community", activityTitle: "Other Civic Issues Mapping" },
        { text: `Compile findings for all ${totalSettlements} settlements`, activityTitle: "Settlement Mapping Data Compilation", completionType: "Upload" },
        { text: "Share settlement-level mapping reports with community groups and cluster coordinators", activityTitle: "Settlement Mapping Report Sharing" },
        { text: "Prioritise top 3 issues per settlement for action planning", activityTitle: "Settlement Issue Prioritisation" },
      ],
    },
    {
      title: "Stakeholder Engagement & Relationship Building",
      type: "Meeting",
      notes: `Establish structured relationships with key government stakeholders in each cluster: ASHA, ANM, PHC staff, police, nodal officer, Medical Officer, Block/Ward office officers. Conduct first round of stakeholder meetings. Set up regular engagement rhythm based on issues identified in baseline mapping.`,
      startSlaDays: 50,
      slaDays: 90,
      checklist: [
        { text: "Map all relevant stakeholders per cluster: ASHA, ANM, PHC MO, police, ward/block officers", activityTitle: "Stakeholder Mapping" },
        { text: "Introduce programme to each stakeholder with formal letter and CO meeting", activityTitle: "Stakeholder Programme Introduction" },
        { text: "Establish regular meeting schedule with PHC (monthly), police (monthly), ward officer (monthly)", activityTitle: "Regular Stakeholder Meeting Schedule Setup" },
        { text: "Conduct first Adalat / grievance forum at slum level in each cluster", activityTitle: "Stakeholder Engagement Meeting", completionType: "Voice" },
        { text: "Invite stakeholders to attend cluster-level community group meetings", activityTitle: "Stakeholder Community Meeting Invitation" },
        { text: "Establish referral pathway for GBV/DV cases to police and support services", activityTitle: "GBV Referral Pathway Setup" },
        { text: "Establish referral pathway for housing/land rights to relevant authorities", activityTitle: "Housing Rights Referral Pathway Setup" },
        { text: "Document stakeholder contacts, meeting rhythm, and engagement status per cluster", activityTitle: "Stakeholder Contact Documentation" },
      ],
    },
    {
      title: "MIS & Mobile App Deployment",
      type: "Milestone",
      notes: `Deploy and operationalise the MIS system and mobile application across all COs and coordinators. The app must capture: community group roster and attendance, meeting rhythm and action plans, civic amenity mapping data, entitlements facilitated, DV cases, MAS group data, and stakeholder visits.`,
      startSlaDays: 30,
      slaDays: 60,
      checklist: [
        { text: "Install mobile app on all CO devices", activityTitle: "Mobile App Installation" },
        { text: "Create user accounts for all COs, cluster coordinators, and programme team", activityTitle: "User Account Setup" },
        { text: "Train all COs on data entry: group meetings, attendance, action plans", activityTitle: "CO MIS Data Entry Training", completionType: "Voice" },
        { text: "Train COs on civic amenities mapping module", activityTitle: "Civic Mapping Module Training" },
        { text: "Train COs on entitlement tracking and DV case reporting", activityTitle: "Entitlement and DV Reporting Training", completionType: "Voice" },
        { text: "Configure cluster coordinator view: groups, meetings, attendance, action plan status", activityTitle: "Cluster Coordinator Dashboard Setup" },
        { text: "Configure MAS tracking module", activityTitle: "MAS Tracking Module Setup" },
        { text: "Conduct first MIS data quality review (2 weeks after deployment)", activityTitle: "MIS Data Quality Review" },
        { text: "Set up monthly MIS reporting cadence for programme team", activityTitle: "Monthly MIS Reporting Setup" },
      ],
    },
    {
      title: "Issue-Based Capacity Building of Community Leaders",
      type: "Training",
      notes: `Based on civic amenities mapping findings, conduct targeted training for community group leaders on specific issues. For example, if waste collection is irregular, train on BBMP process, grievance portal, responsible officer identification. Monthly 1-day training for group leaders planned throughout Year 1.`,
      startSlaDays: 75,
      slaDays: 110,
      checklist: [
        { text: "Review mapping data to identify top 3 issues per cluster", activityTitle: "Cluster Issue Priority Review" },
        { text: "Design issue-specific training modules for top civic amenity issues", activityTitle: "Issue Training Module Design" },
        { text: "Train leaders on: how to use grievance redressal portals (BBMP, ward, PHC)", activityTitle: "Grievance Portal Training", completionType: "Voice" },
        { text: "Train leaders on: how to identify and meet responsible department officer", activityTitle: "Officer Identification Training", completionType: "Voice" },
        { text: "Train leaders on: writing complaint letters and follow-up process", activityTitle: "Complaint Letter Writing Training", completionType: "Voice" },
        { text: "Train leaders on: housing rights and land title deed application process", activityTitle: "Housing Rights Training", completionType: "Voice" },
        { text: "Conduct exposure visit for community leaders to a well-functioning similar programme", activityTitle: "Community Leader Exposure Visit", completionType: "Voice" },
        { text: "Begin tracking resolution rate of issues identified in baseline mapping", activityTitle: "Issue Resolution Tracking Setup" },
      ],
    },
    {
      title: "Land Title Deed & Housing Rights Drive",
      type: "Milestone",
      notes: `Facilitate land title deed applications for eligible households across all clusters. COs to spend ~3 days/month on collection of applications and follow-up. Train COs and community leaders on application process. Conduct exposure visits to existing models.`,
      startSlaDays: 60,
      slaDays: 120,
      checklist: [
        { text: "Train COs on land title deed eligibility criteria and application process", activityTitle: "CO Land Rights Training", completionType: "Voice" },
        { text: "Conduct exposure visit for COs to an existing housing rights model", activityTitle: "CO Housing Rights Exposure Visit", completionType: "Voice" },
        { text: "Identify eligible households in each settlement", activityTitle: "Eligible Household Identification" },
        { text: "Conduct application collection drives (CO 3 days/month dedicated)", activityTitle: "Housing Rights Application Drive" },
        { text: "Submit applications to relevant authority (municipality/BDA/BBMP)", activityTitle: "Housing Application Submission", completionType: "Upload" },
        { text: "Track application status per household in MIS", activityTitle: "Application Status Tracking" },
        { text: "Conduct department follow-up visits (monthly)", activityTitle: "Department Follow-up Visit", completionType: "Voice" },
        { text: "Report resolution rate of housing/land rights cases quarterly", activityTitle: "Quarterly Housing Rights Report" },
      ],
    },
    {
      title: "Review & Monitoring Cadence Setup",
      type: "Milestone",
      notes: `Establish the full programme review and supervision architecture. Monthly: CC visits bi-monthly to each CO, resource centre monthly review, foundation team participates in cluster meetings. Key metrics: group meeting cadence, civic issue resolution rate, MAS functioning, entitlements facilitated, DV referrals.`,
      startSlaDays: 90,
      slaDays: 120,
      checklist: [
        { text: "Set Cluster Coordinator bi-monthly visit schedule to each CO's group meetings", activityTitle: "CC Visit Schedule Setup" },
        { text: "Schedule monthly resource centre review (COs share action plans and status)", activityTitle: "Resource Centre Review Scheduling" },
        { text: "Schedule monthly cluster-level meeting (CC + all COs + community leaders)", activityTitle: "Monthly Cluster Meeting Scheduling" },
        { text: "Schedule monthly foundation team participation in cluster meetings", activityTitle: "Foundation Team Meeting Scheduling" },
        { text: "Schedule monthly Cluster Coordinator review by zone/programme lead", activityTitle: "Zone Lead Review Scheduling" },
        { text: "Define key metrics tracking: group meeting cadence & attendance", activityTitle: "Group Meeting Metrics Setup" },
        { text: "Define key metrics tracking: civic amenity issue resolution rate (one-time and recurring)", activityTitle: "Civic Issue Resolution Metrics Setup" },
        { text: "Define key metrics tracking: 100% of members able to resolve frequent category issues", activityTitle: "Member Capability Metrics Setup" },
        { text: "Define key metrics tracking: MAS meeting frequency and PHC issue resolution", activityTitle: "MAS Performance Metrics Setup" },
        { text: "Define key metrics tracking: land/housing applications filed and resolved", activityTitle: "Housing Rights Metrics Setup" },
        { text: "Define key metrics tracking: DV/GBV referrals made and follow-up status", activityTitle: "DV/GBV Metrics Setup" },
        { text: "Conduct first round of monthly reviews and document learnings", activityTitle: "First Programme Review Meeting" },
      ],
    },
  ];
}

// ── Children Learning Centre Template ────────────────────────────────────────

function buildChildrenTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const centres = Number(params.centres) || 1;
  const track = String(params.track || "new");
  const totalChildren = centres * 100;        // 100 children per centre
  const totalCOs = centres * 2;               // 2 outreach workers per centre
  const hasLead = centres > 1;                // children lead required once >1 centre

  if (track === "existing") {
    return [
      {
        title: "Centre Visits — Twice Weekly",
        type: "SiteVisit",
        recurrence: "Weekly",
        notes: `RP visits the children's centre twice a week (½ day each visit). Handhold coordinator on planned activities, review attendance and learning quality, flag material or infrastructure needs.`,
        startSlaDays: 0,
        slaDays: 7,
        checklist: [
          { text: "Visit 1 this week: centre activity for the day observed", activityTitle: "Centre Visit", completionType: "Voice" },
          { text: "Visit 1: coordinator supported on planned activity", activityTitle: "Coordinator Activity Support" },
          { text: "Visit 1: attendance register reviewed", activityTitle: "Attendance Register Review" },
          { text: "Visit 1: learning quality spot-check done", activityTitle: "Learning Quality Spot-Check" },
          { text: "Visit 1: infrastructure / material needs flagged", activityTitle: "Infrastructure Needs Assessment" },
          { text: "Visit 1: coordinator debrief completed", activityTitle: "Coordinator Debrief" },
          { text: "Visit 2 this week: same checks repeated", activityTitle: "Second Centre Visit", completionType: "Voice" },
          { text: "Visit 2: coordinator debrief completed", activityTitle: "Second Visit Coordinator Debrief" },
        ],
      },
      {
        title: "Monthly Training",
        type: "Training",
        recurrence: "Monthly",
        notes: "RP attends monthly children's programme training and reinforces key learnings with the coordinator post-session.",
        startSlaDays: 0,
        slaDays: 30,
        checklist: [
          { text: "Training topic aligned with monthly plan", activityTitle: "Monthly Training Topic Alignment" },
          { text: "Full session attended", activityTitle: "Monthly Children Programme Training", completionType: "Voice" },
          { text: "Key learning shared with coordinator", activityTitle: "Learning Debrief with Coordinator" },
          { text: "Coordinator practice / implementation plan agreed", activityTitle: "Coordinator Implementation Plan" },
          { text: "Attendance recorded", activityTitle: "Training Attendance Recording" },
        ],
      },
      {
        title: "Govt School & DI Coordination",
        type: "Meeting",
        recurrence: "Monthly",
        notes: "Monthly coordination with relevant government schools and the District Inspector (DI) on dropout follow-up and school-community engagement.",
        startSlaDays: 0,
        slaDays: 30,
        checklist: [
          { text: "Target school(s) visited or DI contacted", activityTitle: "School / DI Coordination Visit", completionType: "Voice" },
          { text: "Out-of-school children list updated", activityTitle: "Out-of-School Children List Update" },
          { text: "Dropout follow-up done with partner coordinator", activityTitle: "Dropout Child Follow-up" },
          { text: "School engagement plan progressed", activityTitle: "School Engagement Plan Update" },
          { text: "Next steps documented and assigned", activityTitle: "Next Steps Documentation" },
        ],
      },
    ];
  }

  return [
    {
      title: "Team Recruitment & Deployment",
      type: "Milestone",
      notes: `Recruit staff for ${centres} Children Learning Centre(s) — 3 staff per centre. Required: ${centres} Centre Coordinator(s) (graduate, preferably from community), ${totalCOs} Children Outreach Worker(s) (from community)${hasLead ? ", 1 Children Lead (mandatory when >1 centre)" : ""}. For expansion: coordinator must be a graduate; outreach workers must be from community; no prior experience required — interest in working with children is essential.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        ...(hasLead ? [{ text: "Recruit Children Lead (1 per organisation, required for >1 centre)", activityTitle: "Children Lead Recruitment" }] : []),
        { text: `Recruit ${centres} Centre Coordinator(s) — graduate, preferably from community`, activityTitle: "Centre Coordinator Recruitment" },
        { text: `Recruit ${totalCOs} Children Outreach Worker(s) — must be from community`, activityTitle: "Outreach Worker Recruitment" },
        { text: "Review and map any existing staff from current programme who are interested and equipped for children work", activityTitle: "Existing Staff Capability Review" },
        { text: "Conduct team induction: programme objectives, child rights, safe space principles", activityTitle: "Team Induction Session", completionType: "Voice" },
        { text: "Assign staff to centres and clusters", activityTitle: "Staff Centre Assignment" },
        { text: "Set up team communication channels and weekly review schedule", activityTitle: "Team Communication Setup" },
      ],
    },
    {
      title: "Centre Location Identification & Rent Agreement",
      type: "SiteVisit",
      notes: `Identify suitable location(s) for ${centres} Children Learning Centre(s). Each CLC must be within 1–1.5 km radius of the target community. Minimum 400–500 sqft for learning corners, peer discussions, and group activities, plus outdoor play space. Basic facilities — safe drinking water and functional toilets — are non-negotiable.`,
      startSlaDays: 7,
      slaDays: 28,
      checklist: [
        { text: "Shortlist 2–3 potential buildings per cluster (within 1–1.5 km radius of community)", activityTitle: "Centre Location Site Visit", completionType: "Voice" },
        { text: "Verify minimum 400–500 sqft indoor space for learning corners and group activities", activityTitle: "Space Requirements Verification" },
        { text: "Verify safe drinking water supply", activityTitle: "Water Supply Verification" },
        { text: "Verify functional and usable toilets", activityTitle: "Toilet Functionality Check" },
        { text: "Check for outdoor/play space adjacent to or near the building", activityTitle: "Outdoor Space Assessment" },
        { text: "Assess ventilation, natural lighting, and basic structural safety", activityTitle: "Building Safety Assessment" },
        { text: "Confirm with cluster coordinator and children lead", activityTitle: "Location Approval Meeting" },
        { text: `Execute rent agreement(s) for ${centres} centre location(s)`, activityTitle: "Centre Rent Agreement Signing", completionType: "Upload" },
      ],
    },
    {
      title: "Centre Infrastructure Setup & Civil Works",
      type: "Milestone",
      notes: `Set up all ${centres} CLC(s) with a colourful, print-rich, child-friendly environment. Age-specific learning corners for 4–8 year olds: blocks, creative, literacy, numeracy, and dramatic play corners. Fixtures and cubbies at child height. Adequate space for individual engagement, small groups, and whole-class activities.`,
      startSlaDays: 21,
      slaDays: 50,
      checklist: [
        { text: "Conduct painting and civil works — colourful walls, illustrations, print-rich environment", activityTitle: "Centre Painting and Civil Works" },
        { text: "Install display boards, flannel boards, and notice boards", activityTitle: "Display Board Installation" },
        { text: "Procure and install book racks and cubbies (child-height, easy to access)", activityTitle: "Book Rack and Cubby Installation" },
        { text: "Set up learning corners for 4–8 yrs: blocks, creative, literacy, numeracy, dramatic play", activityTitle: "Learning Corners Setup" },
        { text: "Procure whiteboard, floor mats, and basic furniture", activityTitle: "Basic Furniture Procurement" },
        { text: "Procure 1 laptop and 1 LCD projector; ensure internet connectivity", activityTitle: "Technology Equipment Procurement" },
        { text: "Set up safe drinking water facility inside centre", activityTitle: "Indoor Water Facility Setup" },
        { text: "Verify toilets are clean and functional", activityTitle: "Toilet Standards Verification" },
        { text: "Put up signage and CLC branding", activityTitle: "Centre Branding Installation" },
        { text: "Conduct safety walkthrough before opening", activityTitle: "Pre-Opening Safety Walkthrough", completionType: "Voice" },
      ],
    },
    {
      title: "Books, TLM & AV Materials Procurement",
      type: "Milestone",
      notes: `Procure all Teaching-Learning Materials (TLM), books, and supplies for ${centres} centre(s). Build a children's library with age-appropriate multilingual books (4–14 yr range). Low-cost and no-cost materials are prioritised. Establish a human resource bank of subject experts and resource persons for co-facilitation. Secure DI (District Institute, Bangalore & Ramanagara) support for capacity building.`,
      startSlaDays: 21,
      slaDays: 45,
      checklist: [
        { text: "Procure age-appropriate multilingual books for library (4–14 year range)", activityTitle: "Library Book Procurement" },
        { text: "Procure TLM for language and literacy (letter cards, word puzzles, story books, phonics)", activityTitle: "Language TLM Procurement" },
        { text: "Procure TLM for maths (number tiles, shapes, dominos, counting games)", activityTitle: "Maths TLM Procurement" },
        { text: "Procure art & craft supplies, indoor games, and board games", activityTitle: "Creative Materials Procurement" },
        { text: "Procure sports equipment for outdoor and indoor play", activityTitle: "Sports Equipment Procurement" },
        { text: "Download and organise AV content: nursery rhymes, communicative English, subject experiments, educational documentaries", activityTitle: "AV Content Setup" },
        { text: "Set up library management register (cataloguing and borrowing tracker)", activityTitle: "Library Register Setup" },
        { text: "Build human resource bank — subject experts, life skills facilitators, DI resource persons", activityTitle: "Resource Person Bank Setup" },
        { text: "Confirm DI (Bangalore/Ramanagara) support for monthly capacity building visits", activityTitle: "DI Partnership Confirmation" },
      ],
    },
    {
      title: "Children Survey & Baseline Learning Assessment",
      type: "Research",
      notes: `Outreach workers conduct door-to-door survey of all children aged 4–14 within 1–1.5 km of each CLC. Identify enrolment status, dropouts, and non-enrolled children. For each child enrolled at the CLC, conduct a friendly informal baseline assessment (oral, worksheet, game-based) — not to grade them, but to help the coordinator plan tailored support. Conducted with DI support.`,
      startSlaDays: 21,
      slaDays: 55,
      checklist: [
        { text: "Outreach workers conduct door-to-door survey of children aged 4–14 in cluster", activityTitle: "Children Baseline Survey", completionType: "Voice" },
        { text: "Record per child: name, gender, DOB, school/anganwadi status, mother tongue, health concerns", activityTitle: "Child Profile Data Entry" },
        { text: "Identify children with irregular school attendance", activityTitle: "Irregular Attendance Identification" },
        { text: "Identify children who have dropped out entirely", activityTitle: "Dropout Children Identification" },
        { text: "Identify children never enrolled in school or anganwadi", activityTitle: "Never-Enrolled Children Identification" },
        { text: "Conduct baseline learning assessment per child (with DI support) — informal, game-based, not graded", activityTitle: "Child Baseline Learning Assessment" },
        { text: "Assess language: letter recognition, reading words/sentences, listening comprehension", activityTitle: "Language Proficiency Assessment" },
        { text: "Assess maths: number recognition, basic operations, word problems", activityTitle: "Numeracy Proficiency Assessment" },
        { text: "Assess general awareness for younger children: body parts, colours, surroundings", activityTitle: "Young Child Awareness Assessment" },
        { text: `Enrol first cohort of ${totalChildren} children across ${centres} centre(s) — enter profiles in MIS`, activityTitle: "Child MIS Enrollment" },
        { text: "Prepare per-child activity plan based on assessment findings", activityTitle: "Individual Activity Plan Preparation" },
      ],
    },
    {
      title: "Staff Capacity Building Programme",
      type: "Training",
      notes: `All Centre Coordinators and Outreach Workers undergo 2 days of training per month throughout Year 1 (calendarized). First module covers: safe space facilitation, child development, reading and writing support methods, baseline assessment tools, library circles, and MIS app. DI resource persons support monthly. External resource persons engaged as needed.`,
      startSlaDays: 28,
      slaDays: 50,
      checklist: [
        { text: "Conduct initial 2-day orientation: programme objectives, child rights, safe space principles", activityTitle: "Staff Capacity Building Orientation", completionType: "Voice" },
        { text: "Train on age-appropriate learning support: reading, writing, numeracy — informal methods", activityTitle: "Learning Support Methods Training", completionType: "Voice" },
        { text: "Train on baseline assessment tools (observation, oral, worksheet, game-based)", activityTitle: "Assessment Tool Training", completionType: "Voice" },
        { text: "Train on facilitating library circles and promoting reading habits", activityTitle: "Library Circle Facilitation Training", completionType: "Voice" },
        { text: "Train on life skills and socio-emotional learning facilitation", activityTitle: "Life Skills Facilitation Training", completionType: "Voice" },
        { text: "Train on using AV materials, low-cost and no-cost teaching aids", activityTitle: "Teaching Aids and AV Training", completionType: "Voice" },
        { text: "Train on MIS app: child profiling, attendance tracking, reading/writing progress, library usage", activityTitle: "MIS App Training", completionType: "Voice" },
        { text: "Finalise 12-month monthly training calendar with DI support", activityTitle: "Annual Training Calendar Finalisation" },
        { text: "Identify and onboard external resource persons for co-facilitation (life skills, digital, sports)", activityTitle: "External Resource Person Onboarding" },
      ],
    },
    {
      title: "Centre Operations Launch",
      type: "Meeting",
      notes: `Launch all ${centres} CLC(s) and begin daily operations. Daily schedule: 3:30 pm onwards — safe space + snack for Anganwadi returnees (4–6 yrs); 4:30–6 pm — safe space, homework support, reading/writing for school children (7–14 yrs); 6–7 pm — library circles, movie/documentary screening, art & craft, indoor/outdoor sports, singing and music. Snacks (egg/chana/banana cooked by rotating mothers) for 50 children per day per centre.`,
      startSlaDays: 50,
      slaDays: 65,
      checklist: [
        { text: "Confirm facility readiness: space, materials, staff, water, toilets", activityTitle: "Pre-Launch Facility Readiness Check" },
        { text: "Conduct community meeting to announce CLC launch and daily schedule", activityTitle: "CLC Launch Community Meeting" },
        { text: "Set up snack programme — identify rotating mothers to cook (egg/chana/banana for 50 children/day)", activityTitle: "Snack Programme Setup" },
        { text: "Launch 3:30 pm slot: safe space and snack for Anganwadi returnees (4–6 yrs)", activityTitle: "Anganwadi Returnees Slot Launch" },
        { text: "Launch 4:30–6 pm slot: safe space, homework support, reading/writing for school children", activityTitle: "School Children Slot Launch" },
        { text: "Launch 6–7 pm slot: library circles, art & craft, music, indoor/outdoor sports, movie screenings", activityTitle: "Evening Enrichment Slot Launch" },
        { text: "Begin child attendance tracking in MIS from Day 1 (CLC and school attendance)", activityTitle: "Child Attendance Tracking Setup" },
        { text: "Prepare activity plan and weekly schedule (themed sessions, sports, creative activities)", activityTitle: "Weekly Activity Plan Preparation" },
        { text: `Confirm all ${totalChildren} children enrolled and profiled in MIS across ${centres} centre(s)`, activityTitle: "MIS Enrollment Verification" },
      ],
    },
    {
      title: "School & Anganwadi Linkage + Re-enrolment Drive",
      type: "Milestone",
      notes: `Outreach workers run a continuous school and anganwadi linkage programme. Age 4–6: focus on anganwadi enrolment. Age 7–11: maintain school attendance, support with irregular attendees. Age 12–14: targeted re-enrolment and referrals. Outreach workers visit schools monthly, meet teachers, track irregular children, visit anganwadis, and follow up with parents.`,
      startSlaDays: 55,
      slaDays: 90,
      checklist: [
        { text: "Outreach workers visit all govt schools in cluster — meet teachers, collect data on irregular/dropout children", activityTitle: "School & Anganwadi Outreach Visit", completionType: "Voice" },
        { text: "Visit anganwadis — meet AWW, identify 4–6 yr children not yet enrolled", activityTitle: "Anganwadi Coordination Visit", completionType: "Voice" },
        { text: "Visit parents of identified dropout, irregular, and non-enrolled children", activityTitle: "Parent Follow-up Home Visit", completionType: "Voice" },
        { text: "Facilitate enrolment of 4–6 yr olds in anganwadi", activityTitle: "Anganwadi Enrollment Support" },
        { text: "Facilitate re-enrolment of 7–11 yr dropouts in school", activityTitle: "School Re-enrollment Support" },
        { text: "Engage dropout children at CLC through art, craft, indoor games, and conversations", activityTitle: "Dropout Re-engagement Session" },
        { text: "Refer 12–14 yr dropouts to bridge courses, open schooling, or vocational options", activityTitle: "Dropout Pathway Counselling" },
        { text: "Launch back-to-school campaign in community", activityTitle: "Back-to-School Community Campaign" },
        { text: "Map scholarship entitlements for eligible children (post-matric, minority, SC/ST)", activityTitle: "Scholarship Entitlement Mapping" },
        { text: "Track re-enrolment outcomes and school attendance per child in MIS", activityTitle: "Re-enrollment Outcome Tracking" },
      ],
    },
    {
      title: "Life Skills, Camps & Enrichment Programme",
      type: "Milestone",
      notes: `Establish a structured enrichment programme covering life skills, creative learning, digital literacy, sports, and community events. Life skills sessions once every 15 days. Two camps per year (Summer and Dasara). Quarterly parenting sessions. Annual leadership training for selected children. Exposure visits for children and staff.`,
      startSlaDays: 60,
      slaDays: 100,
      checklist: [
        { text: "Design fortnightly life skills module calendar: decision-making, empathy, hygiene, safety, self-awareness", activityTitle: "Life Skills Module Calendar Design" },
        { text: "Design thematic session calendar: health, child rights, environment, reflection circles, theatre", activityTitle: "Thematic Session Calendar Design" },
        { text: "Set up peer learning programme — older youth/adolescents as tutors and mentors", activityTitle: "Peer Learning Programme Setup" },
        { text: "Set up digital literacy sessions (laptop/computer access, basic digital skills)", activityTitle: "Digital Literacy Session Setup" },
        { text: "Establish weekly outdoor and indoor sports schedule", activityTitle: "Sports Schedule Establishment" },
        { text: "Conduct Summer camp (Camp 1 of 2 per year)", activityTitle: "Summer Life Skills Camp" },
        { text: "Schedule Dasara camp (Camp 2 of 2)", activityTitle: "Dasara Camp Scheduling" },
        { text: "Set up quarterly parenting sessions (themes: nutrition, child safety, school support)", activityTitle: "Quarterly Parenting Session Setup" },
        { text: "Identify children for annual leadership training programme", activityTitle: "Leadership Programme Child Selection" },
        { text: "Plan quarterly exposure visits for children; annual exposure visit for staff", activityTitle: "Exposure Visit Planning", completionType: "Voice" },
        { text: "Plan celebration of important days (Children's Day, environment day, child rights day)", activityTitle: "Important Days Calendar Planning" },
      ],
    },
    {
      title: "MIS Setup & Monitoring Cadence",
      type: "Milestone",
      notes: `Deploy MIS app across all ${centres} centre(s). Tracks: child profile, CLC and school attendance, reading/writing improvement, library utilisation, activity completion, and scholarship status. Monitoring: Children Lead visits each centre weekly; DI resource person visits monthly (full day) to support and review; urban team member visits fortnightly; monthly coordinator review meeting.`,
      startSlaDays: 45,
      slaDays: 65,
      checklist: [
        { text: "Set up MIS app — enrol all children with full profile and baseline assessment data", activityTitle: "MIS App Child Enrollment" },
        { text: "Configure attendance tracking: CLC daily attendance + school frequency per child", activityTitle: "Attendance Tracking Configuration" },
        { text: "Configure reading progress tracking: improvement across language levels over time", activityTitle: "Reading Progress Tracker Setup" },
        { text: "Configure writing progress tracking", activityTitle: "Writing Progress Tracker Setup" },
        { text: "Configure library module: books taken, reading frequency, participation", activityTitle: "Library Module Configuration" },
        { text: "Configure activity tracker: participation level (highly involving / sometimes / not involving)", activityTitle: "Activity Participation Tracker Setup" },
        { text: "Configure scholarship and entitlement tracking per child", activityTitle: "Scholarship Tracker Configuration" },
        { text: `Set Children Lead weekly visit schedule to all ${centres} centre(s) (handholding + review)`, activityTitle: "Children Lead Visit Schedule Setup" },
        { text: "Set DI resource person monthly full-day visit schedule (support, review, capacity building)", activityTitle: "DI Monthly Visit Schedule Setup" },
        { text: "Set urban team fortnightly visit schedule", activityTitle: "Urban Team Visit Schedule Setup" },
        { text: "Set monthly review meeting: all centre coordinators + children lead", activityTitle: "Monthly Review Meeting Setup" },
        { text: "Conduct first monthly review — share learnings from launch period", activityTitle: "First Monthly CLC Review Meeting" },
      ],
    },
  ];
}

// ── Youth Resource Centre Template ────────────────────────────────────────────

function buildYouthTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const yrcs = Number(params.yrcs) || 1;
  const track = String(params.track || "new");
  const totalYouth = yrcs * 1000;                      // 1 YRC per cluster, 1000 youth per YRC
  const intensiveYouth = yrcs * 200;                   // each worker closely works with 200
  const youthWorkers = yrcs * 2;                       // 2 workers per YRC

  if (track === "existing") {
    return [
      {
        title: "Saturday Centre Visit & CAP Review",
        type: "SiteVisit",
        recurrence: "Weekly",
        notes: `Every Saturday: RP visits the Youth Resource Centre (½ day/week). Reviews CAP progress with youth groups, supports the coordinator, and tracks milestones, blockers, and wins.`,
        startSlaDays: 0,
        slaDays: 7,
        checklist: [
          { text: "Youth Resource Centre visited", activityTitle: "Saturday YRC Visit & CAP Review", completionType: "Voice" },
          { text: "Coordinator supported on current programme priorities", activityTitle: "Coordinator Priority Support" },
          { text: "Youth groups met for CAP review", activityTitle: "Youth CAP Progress Review" },
          { text: "CAP milestones status updated", activityTitle: "CAP Milestone Status Update" },
          { text: "Blockers and issues logged", activityTitle: "Youth Programme Blockers Log" },
          { text: "Wins noted for motivation and documentation", activityTitle: "Programme Wins Documentation" },
          { text: "Next Saturday priorities agreed with coordinator", activityTitle: "Next Week Priorities Agreement" },
        ],
      },
      {
        title: "Monthly Training",
        type: "Training",
        recurrence: "Monthly",
        notes: "RP attends monthly youth programme training and briefs the coordinator on key takeaways.",
        startSlaDays: 0,
        slaDays: 30,
        checklist: [
          { text: "Training topic aligned with monthly plan", activityTitle: "Monthly Youth Training Topic Alignment" },
          { text: "Full session attended", activityTitle: "Monthly Youth Programme Training", completionType: "Voice" },
          { text: "Coordinator briefed post-training", activityTitle: "Post-Training Coordinator Briefing", completionType: "Voice" },
          { text: "Implementation plan agreed with coordinator", activityTitle: "Youth Coordinator Implementation Plan" },
          { text: "Attendance recorded", activityTitle: "Youth Training Attendance Recording" },
        ],
      },
    ];
  }
  const youthLeaders = yrcs * 2 * 20;                  // 20 leaders per worker
  const hasYouthLead = yrcs >= 2;                      // youth lead when ≥2 YRCs

  return [
    {
      title: "Team Recruitment & Deployment",
      type: "Milestone",
      notes: `Recruit staff for ${yrcs} Youth Resource Centre(s). Required: ${yrcs} YRC Coordinator(s), ${youthWorkers} Youth Worker(s) (2 per YRC)${hasYouthLead ? ", 1 Youth Lead (mandatory when ≥2 YRCs)" : ""}. Each worker reaches 500 youth but closely works with 200 and develops 20 youth leaders. Non-negotiable: youth workers must be from the community. No prior experience required — interest in youth and community work is essential. For existing staff: select those who have built strong youth relationships and brought youth regularly to centres.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        ...(hasYouthLead ? [{ text: "Recruit Youth Lead (1 per organisation, mandatory for ≥2 YRCs)", activityTitle: "Youth Lead Recruitment" }] : []),
        { text: `Recruit ${yrcs} YRC Coordinator(s)`, activityTitle: "YRC Coordinator Recruitment" },
        { text: `Recruit ${youthWorkers} Youth Worker(s) — must be from community, 2 per YRC`, activityTitle: "Youth Worker Recruitment" },
        { text: "Map existing community organizers — assess youth relationship-building track record", activityTitle: "Existing CO Youth Track Record Assessment" },
        { text: "Conduct team induction: programme objectives, youth vulnerability context, gender lens", activityTitle: "Team Induction Session", completionType: "Voice" },
        { text: "Contextualise with local data: 32% dropout after 10th grade, 63% working by 21, 28% married before 21", activityTitle: "Local Youth Context Briefing" },
        { text: "Brief on local patterns: substance abuse, GBV, early pregnancy, undertrial cases", activityTitle: "Local Risk Patterns Briefing" },
        { text: "Assign workers to YRCs; define reporting relationships", activityTitle: "Worker YRC Assignment" },
        { text: "Set up team communication channels and weekly review rhythm", activityTitle: "Team Communication Setup" },
      ],
    },
    {
      title: "YRC Location Selection & Neighbour Sensitisation",
      type: "SiteVisit",
      notes: `Identify location(s) for ${yrcs} Youth Resource Centre(s). Each YRC needs 2–3 rooms and at least 700 sqft. Preferred: close to the community but accessible from the nearest transport point to the slum. Neighbourhood must tolerate noise and late-evening sounds — neighbours must be sensitised with the support of the landlord before signing the agreement.`,
      startSlaDays: 7,
      slaDays: 30,
      checklist: [
        { text: `Shortlist 2–3 candidate locations per YRC — close to community, accessible from transport`, activityTitle: "YRC Location Site Visit", completionType: "Voice" },
        { text: "Verify minimum 700 sqft with 2–3 rooms (group space, library/reading area, counselling corner)", activityTitle: "YRC Space Requirements Verification" },
        { text: "Assess neighbourhood: noise tolerance for evening activities is critical", activityTitle: "Neighbourhood Noise Tolerance Assessment" },
        { text: "Sensitise neighbours about programme purpose with support of landlord", activityTitle: "Neighbour Sensitisation Meeting" },
        { text: "Verify adequate ventilation, lighting, and safety", activityTitle: "YRC Safety and Lighting Verification" },
        { text: `Execute rent agreement(s) for ${yrcs} YRC location(s)`, activityTitle: "YRC Rent Agreement Signing", completionType: "Upload" },
        { text: "Confirm location with cluster coordinator and youth team", activityTitle: "YRC Location Approval Meeting" },
      ],
    },
    {
      title: "YRC Infrastructure Setup",
      type: "Milestone",
      notes: `Set up all ${yrcs} YRC(s) in a participatory manner — identified youth from the community must be involved in painting and furnishing. Each YRC: 2 racks for library books, 30 chairs, 2 tables, 1 projector, 1 screen, WiFi, 1 camera and gear, library with curated books, cultural activity corner, information bank notice board, and a private counselling space.`,
      startSlaDays: 21,
      slaDays: 50,
      checklist: [
        { text: "Involve identified youth from community in painting and furnishing (participatory setup)", activityTitle: "Youth-Led YRC Painting and Setup" },
        { text: "Procure and install 2 book racks for library", activityTitle: "Library Rack Installation" },
        { text: "Procure 30 chairs and 2 tables per YRC", activityTitle: "Furniture Procurement" },
        { text: "Procure 1 projector, 1 screen, camera and assistive gear per YRC", activityTitle: "AV and Photography Equipment Procurement" },
        { text: "Set up WiFi connection", activityTitle: "WiFi Connection Setup" },
        { text: "Build library: curate books on health, legal literacy, financial literacy, career, life skills", activityTitle: "YRC Library Curation" },
        { text: "Set up cultural activity corner: musical instruments, indoor board games, art & craft supplies", activityTitle: "Cultural Activity Corner Setup" },
        { text: "Install information bank notice board: schemes, scholarships, helplines, opportunities", activityTitle: "Information Bank Notice Board Setup" },
        { text: "Set up private counselling corner (individual and small group sessions)", activityTitle: "Counselling Corner Setup" },
        { text: "Conduct community announcement of YRC opening", activityTitle: "YRC Opening Announcement" },
        { text: "Finalise YRC visiting hours and daily/weekly activity schedule", activityTitle: "YRC Activity Schedule Finalisation" },
      ],
    },
    {
      title: "Staff Orientation & Training Programme",
      type: "Training",
      notes: `All youth workers and YRC coordinators undergo a 3-day residential orientation. Followed by 2 days of training per month for the first 6 months (calendarized). Trainings conducted by internal and external resource persons. For existing staff already mapped to the programme, preparatory training of 2 days/month for 3–6 months before launch.`,
      startSlaDays: 14,
      slaDays: 45,
      checklist: [
        { text: "For existing staff: conduct 2-day/month preparatory training for 3–6 months (before official launch)", activityTitle: "Existing Staff Preparatory Training", completionType: "Voice" },
        { text: "Conduct 3-day orientation for all new youth programme staff", activityTitle: "Youth Staff Orientation Training", completionType: "Voice" },
        { text: "Day 1: programme objectives, youth development context, gender and intersectionality", activityTitle: "Orientation Day 1: Youth Development Context", completionType: "Voice" },
        { text: "Day 2: safe space facilitation, counselling basics, crisis identification and referral", activityTitle: "Orientation Day 2: Safe Space and Counselling", completionType: "Voice" },
        { text: "Day 3: YRC operations, outreach methods, documentation, MIS app", activityTitle: "Orientation Day 3: YRC Operations and MIS", completionType: "Voice" },
        { text: "Finalise 6-month monthly training calendar (2 days/month) with internal and external RPs", activityTitle: "6-Month Training Calendar Finalisation" },
        { text: "Schedule training themes: SRHR, mental health, legal literacy, financial literacy, constitutional values, digital literacy", activityTitle: "Training Themes Schedule Setup" },
        { text: "Identify and onboard external resource persons for specialised sessions", activityTitle: "External Resource Person Onboarding" },
      ],
    },
    {
      title: "Youth Enumeration & Baseline Survey",
      type: "Research",
      notes: `Enumerate all youth aged 15–21 in each cluster's settlements. Each YRC serves 1000 youth; each worker closely engages 200 and develops 20 leaders. Also enumerate 22–30 year olds for need-based support. MIS captures full profile: education/employment status, documentation access, caste, religion, dropout reasons if applicable.`,
      startSlaDays: 21,
      slaDays: 60,
      checklist: [
        { text: `Enumerate youth aged 15–21 in all settlements — target ${totalYouth} total across ${yrcs} YRC(s)`, activityTitle: "Youth Baseline Enumeration", completionType: "Voice" },
        { text: "Record: name, gender, DOB, caste, religion, mother tongue, cluster/slum, contact, family details", activityTitle: "Youth Profile Data Entry" },
        { text: "Record education/employment status: studying, studying+working, working, homemaker, job-seeking, dropout", activityTitle: "Youth Education/Employment Status Recording" },
        { text: "For dropouts: record reasons (financial, family emergency, marriage, substance use, lack of interest, etc.)", activityTitle: "Dropout Reason Documentation" },
        { text: "Record documentation access: Aadhaar, voter ID, bank account, ration card, caste/income certificate", activityTitle: "Youth Documentation Gap Assessment" },
        { text: "Assess scholarship access: post-matric, BBMP fee reimbursement, Yuva Spandana, APF scholarship", activityTitle: "Scholarship Access Assessment" },
        { text: "Identify at-risk youth: substance abuse, GBV, potential early marriage, trafficking signs, undertrial", activityTitle: "At-Risk Youth Identification" },
        { text: "Enumerate 22–30 yr olds separately for need-based support tracking", activityTitle: "Young Adult Enumeration", completionType: "Voice" },
        { text: "Enter all baseline data into MIS; assign each worker their 500-youth caseload", activityTitle: "Youth MIS Data Entry and Caseload Assignment" },
      ],
    },
    {
      title: "Small Group Meetings & YRC Activation",
      type: "Meeting",
      notes: `Youth workers conduct regular small group meetings in settlements to build rapport, introduce the YRC, and identify interested youth. Build footfall at the YRC through cultural activities, sports, and monthly awareness meetings. Identify the 200 youth per worker who will be closely engaged and the leadership pipeline of 20 per worker.`,
      startSlaDays: 35,
      slaDays: 80,
      checklist: [
        { text: "Conduct first round of small group meetings per settlement — introduce YRC and programme", activityTitle: "Youth Small Group Meeting", completionType: "Voice" },
        { text: "Hold awareness meetings at slum level (monthly)", activityTitle: "Community Awareness Meeting", completionType: "Voice" },
        { text: "Set up cultural activities at YRC: musical instruments, indoor games, art & craft (daily/weekly)", activityTitle: "YRC Cultural Activities Setup" },
        { text: "Organise first outdoor sports event or youth cultural programme for broad mobilisation", activityTitle: "Youth Mobilisation Sports/Cultural Event" },
        { text: "Identify from meetings: 200 youth per worker for close engagement", activityTitle: "Close-Engagement Youth Identification" },
        { text: "Identify from meetings: 20 youth per worker showing leadership interest (pipeline)", activityTitle: "Youth Leadership Pipeline Identification" },
        { text: "Track YRC footfall: new youth visiting YRC, youth visiting repeatedly (>2 times/month)", activityTitle: "YRC Footfall Tracking Setup" },
        { text: "Document issues and needs raised in small group meetings — feed into activity planning", activityTitle: "Youth Needs Documentation" },
        { text: "Begin monthly awareness meetings with relevant stakeholders (ASHA, police, school, PHC)", activityTitle: "Monthly Stakeholder Awareness Meeting" },
      ],
    },
    {
      title: "Thematic Sessions & Capacity Building for Youth",
      type: "Training",
      notes: `Facilitate monthly thematic sessions at the YRC. Quarterly Yuva Adda on gender, GBV, constitution, caste, pluralism, environment. 2-day capacity-building workshops for youth (batches). Topics: health, reproductive health, nutrition, mental health, legal literacy, financial literacy, constitutional values, digital literacy, substance abuse. Individual and group counselling available at YRC.`,
      startSlaDays: 50,
      slaDays: 90,
      checklist: [
        { text: "Design 2-day capacity-building workshop curriculum for youth", activityTitle: "Youth Workshop Curriculum Design" },
        { text: "Conduct first 2-day workshop — health, hygiene, reproductive health, nutrition", activityTitle: "Youth Capacity Building Workshop" },
        { text: "Set up monthly session calendar: mental health, legal literacy, financial literacy, digital literacy", activityTitle: "Monthly Thematic Session Calendar Setup" },
        { text: "Set up monthly session calendar: constitutional values, substance abuse, career counselling, SRHR", activityTitle: "Additional Thematic Session Calendar Setup" },
        { text: "Schedule quarterly Yuva Adda (gender equality, GBV, constitution, caste, pluralism, environment)", activityTitle: "Quarterly Yuva Adda Scheduling" },
        { text: "Set up individual counselling availability at YRC (youth worker + referral when needed)", activityTitle: "Individual Counselling Setup" },
        { text: "Set up group counselling for identified at-risk youth", activityTitle: "Group Counselling Setup" },
        { text: "Populate YRC information bank with brochures, scheme helplines, and reference materials", activityTitle: "YRC Information Bank Population" },
        { text: "Plan first youth festival / cultural programme", activityTitle: "Youth Festival Planning" },
        { text: "Raise POCSO awareness in the community", activityTitle: "POCSO Community Awareness Session" },
      ],
    },
    {
      title: "Documentation & Scheme Linkage Drive",
      type: "Milestone",
      notes: `Facilitate access to identity documents and entitlements for all enrolled youth. Map each youth's documentation gaps from the baseline survey. Then facilitate applications for scholarships, skill training, and higher education. Youth workers dedicate time monthly to department visits and follow-up. Key schemes: post-matric scholarships, BBMP fee reimbursement (Shulka Marupavathi), Yuva Spandana, APF scholarship, NYK registration.`,
      startSlaDays: 45,
      slaDays: 90,
      checklist: [
        { text: "Review baseline documentation gaps per youth: Aadhaar, voter ID, bank account, ration card, caste/income certificate", activityTitle: "Youth Documentation Gap Review" },
        { text: "Organise documentation camps to address gaps in bulk", activityTitle: "Documentation Camp" },
        { text: "Register eligible youth with Nehru Yuva Kendra (NYK)", activityTitle: "NYK Registration Drive" },
        { text: "Facilitate post-matric scholarship applications (SC/ST, minority, general)", activityTitle: "Post-Matric Scholarship Application Support" },
        { text: "Facilitate BBMP fee reimbursement (Shulka Marupavathi) for eligible students", activityTitle: "BBMP Fee Reimbursement Support" },
        { text: "Facilitate Yuva Spandana scheme registration", activityTitle: "Yuva Spandana Registration Support" },
        { text: "Facilitate APF scholarship applications where applicable", activityTitle: "APF Scholarship Application Support" },
        { text: "Facilitate skill training enrolment (NSDC, state skill missions, NGO programmes)", activityTitle: "Skill Training Enrollment Support", completionType: "Voice" },
        { text: "Facilitate college referral and preparation for interested youth", activityTitle: "College Referral and Preparation" },
        { text: "Set up monthly department visit rhythm — youth workers dedicated days for follow-up", activityTitle: "Monthly Department Visit Schedule Setup" },
        { text: "Track scheme application status per youth in MIS", activityTitle: "Scheme Application Status Tracking" },
      ],
    },
    {
      title: "Youth Leadership Programme",
      type: "Training",
      notes: `Develop ${youthLeaders} youth leaders (20 per worker across ${yrcs} YRC(s)) through structured leadership training, action research, and peer mentoring. These youth will eventually become community mentors and potential youth workers. Leadership activities begin once YRC has decent regular footfall — typically after 3–4 months.`,
      startSlaDays: 60,
      slaDays: 110,
      checklist: [
        { text: `Confirm ${youthLeaders} youth as leadership cohort (20 per worker)`, activityTitle: "Leadership Cohort Confirmation" },
        { text: "Conduct leadership orientation: community development, rights, documentation, gender", activityTitle: "Youth Leadership Orientation", completionType: "Voice" },
        { text: "Assign action research: assess functioning of a public institution (PHC, school, ration shop, SDMC)", activityTitle: "Youth Action Research Assignment" },
        { text: "Support youth in documenting findings and drafting recommendations", activityTitle: "Action Research Documentation Support" },
        { text: "Facilitate youth-led presentation to relevant department official", activityTitle: "Youth-Led Department Presentation" },
        { text: "Identify 1–2 youth per YRC as potential future youth workers/mentors", activityTitle: "Future Youth Worker Identification" },
        { text: "Coach youth leaders: scholarship support for peers, sports coaching, academic peer support", activityTitle: "Youth Leader Coaching Session" },
        { text: "Plan and conduct exposure visit for youth leaders", activityTitle: "Youth Leader Exposure Visit", completionType: "Voice" },
        { text: "Felicitate outstanding leaders at annual youth festival", activityTitle: "Youth Leader Felicitation at Festival" },
        { text: "Track leadership engagement and community action in MIS", activityTitle: "Leadership Engagement MIS Tracking" },
      ],
    },
    {
      title: "Youth-Led Social Action Programme",
      type: "Milestone",
      notes: `Social action begins after 6–8 months of preparatory work (enlisting, campaigns, decent YRC footfall). Youth are split into groups of 5. Each worker is responsible for 5–10 social action programmes. Categories: crisis intervention (child marriage, trafficking, GBV), community building (street plays, wall paintings, events), youth cadre (sports coaching, scholarship support), and community work (re-enrolment, scheme advocacy, institution improvement).`,
      startSlaDays: 180,
      slaDays: 240,
      checklist: [
        { text: "Confirm YRC readiness: 6–8 months of operations, decent footfall, enrolled leadership cohort", activityTitle: "YRC Social Action Readiness Check" },
        { text: "Divide active youth into action groups of 5", activityTitle: "Youth Action Group Formation" },
        { text: "Each worker identifies 5–10 social action programmes from the categories below", activityTitle: "Social Action Programme Identification" },
        { text: "Crisis intervention actions: identify and escalate child marriage, trafficking signs, GBV cases", activityTitle: "Crisis Intervention Action" },
        { text: "Crisis intervention: accompany survivors to police/court; serve as witnesses; first responder for GBV", activityTitle: "Survivor Accompaniment to Police/Court" },
        { text: "Community building: street plays, wall paintings, film screenings, inter-faith celebrations", activityTitle: "Community Building Cultural Programme" },
        { text: "Youth cadre: coach younger children in sports; support peers in scholarship and job applications", activityTitle: "Youth Cadre Coaching Session" },
        { text: "Community work: re-enrol dropout students; support younger students academically; peer counselling", activityTitle: "Community Academic Support Action" },
        { text: "Community work: ensure menstrual product access; lead tree plantation drives; organise health camps", activityTitle: "Community Health and Environment Action" },
        { text: "Community work: review school/SDMC/PHC functioning → take action (meetings, escalations, appeals)", activityTitle: "Public Institution Review and Action" },
        { text: "Community work: conduct welfare scheme surveys (PDS, pensions, UDID, caste certificates)", activityTitle: "Welfare Scheme Community Survey", completionType: "Voice" },
        { text: "Community work: organise lok adalats/Jan Sunwai if entitlements are denied", activityTitle: "Lok Adalat / Jan Sunwai Organisation", completionType: "Voice" },
        { text: "Document outcomes of each social action programme in MIS", activityTitle: "Social Action Outcome Documentation" },
      ],
    },
    {
      title: "Crisis Intervention & Referral System",
      type: "Milestone",
      notes: `Establish a functioning support system for youth in crisis — substance abuse, GBV, early pregnancy, undertrial cases. Referral pathways to NIMHANS, psychologists, legal aid, and shelter services. Peer-to-peer support groups. Youth workers proactively identify at-risk youth from enumeration data and ongoing engagement.`,
      startSlaDays: 45,
      slaDays: 75,
      checklist: [
        { text: "Map crisis referral services: NIMHANS, psychologists, legal aid, shelter, DV helplines, police", activityTitle: "Crisis Referral Services Mapping" },
        { text: "Establish referral pathway for substance abuse (counselling → professional care → follow-up)", activityTitle: "Substance Abuse Referral Pathway Setup" },
        { text: "Establish referral pathway for GBV / domestic violence (safe reporting → police → legal aid)", activityTitle: "GBV Referral Pathway Setup" },
        { text: "Establish referral pathway for undertrial/legal cases (legal aid, court accompaniment)", activityTitle: "Legal Aid Referral Pathway Setup" },
        { text: "Establish referral pathway for potential child marriage (identify → escalate → intervene)", activityTitle: "Child Marriage Prevention Pathway Setup" },
        { text: "Identify early trafficking signs and escalate to NGO/police", activityTitle: "Trafficking Signs Identification and Escalation" },
        { text: "Set up peer-to-peer support group at each YRC", activityTitle: "Peer Support Group Setup" },
        { text: "Train youth workers on basic counselling, crisis de-escalation, and when to refer", activityTitle: "Crisis Counselling Training for Workers", completionType: "Voice" },
        { text: "Identify at-risk youth from enumeration and initiate individual engagement plan", activityTitle: "At-Risk Youth Individual Engagement Plan" },
        { text: "Track crisis cases in MIS: type, referral made, follow-up status, outcome", activityTitle: "Crisis Case MIS Tracking Setup" },
      ],
    },
    {
      title: "MIS Setup & Monitoring Cadence",
      type: "Milestone",
      notes: `Operationalise the Youth MIS. Key metrics: new youth at YRC, youth reached, sessions conducted vs planned, avg attendance, individual support facilitated, referrals made/successful, youth in multiple activities, community activity conducted vs planned. Monitoring: YRC Coordinator oversees workers daily; Youth Lead visits weekly (half-day at YRC + half-day with workers in field); Foundation RP visits all YRCs monthly; monthly review of all coordinators and workers by Youth Lead; monthly meeting of all Youth Leads by Foundation RP.`,
      startSlaDays: 35,
      slaDays: 60,
      checklist: [
        { text: "Set up MIS — enrol all enumerated youth with baseline data", activityTitle: "Youth MIS Setup and Enrollment" },
        { text: "Configure: YRC daily attendance, session attendance, group meeting attendance", activityTitle: "YRC Attendance Tracking Configuration" },
        { text: "Configure: youth visited repeatedly (>2 times/month) tracker", activityTitle: "Repeat Youth Visits Tracker Setup", completionType: "Voice" },
        { text: "Configure: scheme and documentation tracker (status per youth)", activityTitle: "Scheme and Documentation Tracker Setup" },
        { text: "Configure: social action tracker (programme type, participants, outcome)", activityTitle: "Social Action Tracker Setup" },
        { text: "Configure: crisis/referral tracker (type, referral, follow-up, outcome)", activityTitle: "Crisis/Referral Tracker Setup" },
        { text: "Configure: leadership programme tracker (cohort, activities, status)", activityTitle: "Leadership Programme Tracker Setup" },
        { text: "Configure programme-level metrics: sessions planned vs conducted, avg attendance, referrals made vs successful", activityTitle: "Programme-Level Metrics Configuration" },
        ...(hasYouthLead ? [{ text: "Set Youth Lead weekly visit schedule (half-day YRC + half-day with workers in field)", activityTitle: "Youth Lead Weekly Visit Schedule Setup" }] : []),
        { text: "Set Foundation RP monthly visit schedule to all YRCs (handholding + review)", activityTitle: "Foundation RP Monthly YRC Visit Schedule" },
        { text: "Set monthly review meeting: all YRC coordinators + youth workers, led by Youth Lead", activityTitle: "Monthly YRC Review Meeting Setup" },
        { text: "Set monthly meeting of all Youth Leads by Foundation RP", activityTitle: "Monthly Youth Leads Meeting Setup" },
        { text: "Conduct first monthly review — document learnings from preparation and early engagement", activityTitle: "First Monthly Youth Programme Review" },
      ],
    },
  ];
}

// ── Seeding Programme Template ───────────────────────────────────────────────

function buildSeedingTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const cohort = Number(params.cohort) || 5;

  return [
    {
      title: "Programme Team Setup & Hiring",
      type: "Milestone",
      notes: `Set up the core seeding team and establish the weekly tracking rhythm. The programme requires 2 additional hires to support sourcing, screening, and handholding. Weekly tracking meeting (Fridays, 9am) between programme leads. Seeding and handholding will be done by respective Geo teams while sourcing and screening are held centrally.`,
      startSlaDays: 0,
      slaDays: 30,
      checklist: [
        { text: "Draft JD and initiate hiring for 2 seeding programme support roles", activityTitle: "Seeding Programme Support Role Hiring" },
        { text: "Identify interim support from existing team while hires are in progress", activityTitle: "Interim Support Identification" },
        { text: "Set up weekly Friday 9am tracking meeting (programme leads)", activityTitle: "Weekly Team Tracking Meeting" },
        { text: "Define roles: who holds sourcing/screening centrally vs geo-level handholding", activityTitle: "Role and Responsibility Definition" },
        { text: "Set up shared tracking sheet / MIS for seeding pipeline", activityTitle: "Pipeline Tracking Setup" },
        { text: "Onboard new hires and orient them on the seeding approach and categories", activityTitle: "New Hire Seeding Orientation", completionType: "Voice" },
      ],
    },
    {
      title: "Geo Demand Estimation",
      type: "Milestone",
      notes: `Engage each Geo team to understand where and what type of seeding is needed. Output: a demand map per geography — thematic priorities, preferred candidate profiles, and readiness to handhold. This demand map drives the sourcing framework. Without it, sourcing risks being supply-led and misaligned.`,
      startSlaDays: 7,
      slaDays: 45,
      checklist: [
        { text: "Design demand estimation questionnaire for Geo teams", activityTitle: "Demand Estimation Questionnaire Design" },
        { text: "Meet each Geo team lead — understand thematic gaps and expansion priorities", activityTitle: "Geo Demand Meeting" },
        { text: "Identify programmatic domains with clarity and frameworks (e.g. livelihoods, creches)", activityTitle: "Programmatic Domain Identification" },
        { text: "Identify geographies where seeding is a priority in the near term", activityTitle: "Priority Geography Identification" },
        { text: "Understand Geo team capacity to handhold a seeded organisation (bandwidth, experience)", activityTitle: "Geo Team Handholding Capacity Assessment" },
        { text: "Compile demand map: geography × theme × preferred candidate type", activityTitle: "Demand Map Compilation" },
        { text: "Share demand map with programme leads for alignment", activityTitle: "Demand Map Alignment Meeting" },
      ],
    },
    {
      title: "Learning from Peer Seeding Institutions",
      type: "Meeting",
      notes: `Engage 3–5 institutions that do seeding or incubation work in the social sector to learn from their experience — what worked, what didn't, how they structure cohorts, what support is most valued, and common failure modes. This informs our model design before we commit to an approach.`,
      startSlaDays: 7,
      slaDays: 45,
      checklist: [
        { text: "Identify 3–5 peer institutions doing seeding/incubation (social sector)", activityTitle: "Peer Institution Identification" },
        { text: "Prepare structured learning questions: sourcing, screening, support model, failure modes", activityTitle: "Peer Learning Questions Preparation" },
        { text: "Conduct conversations with each institution — take structured notes", activityTitle: "Peer Institution Learning Conversations" },
        { text: "Understand how they differentiate between categories (freshers vs alumni vs young orgs)", activityTitle: "Category Differentiation Learning" },
        { text: "Understand their capacity-building approach and what worked", activityTitle: "Capacity Building Approach Learning" },
        { text: "Understand how they manage the 'thin line' between over-involvement and under-support", activityTitle: "Handholding Balance Learning" },
        { text: "Synthesise learnings into a 1-page note for internal discussion", activityTitle: "Peer Learning Synthesis Note" },
      ],
    },
    {
      title: "Sourcing Framework Development",
      type: "Milestone",
      notes: `Develop the sourcing framework covering all 5 candidate categories: (A) freshers from social work colleges, (B) alumni in CSOs / partner orgs, (C) youth leaders already engaged in communities, (D) young organisations not yet grown, (E) alumni from non-social-work institutions. Each category has a different sourcing channel, screening lens, and mode of engagement. Framework must link to the geo demand map.`,
      startSlaDays: 30,
      slaDays: 60,
      checklist: [
        { text: "Draft sourcing channels per category (A–E) — colleges, networks, partner orgs, communities", activityTitle: "Sourcing Channels Draft" },
        { text: "Define screening criteria per category — what does 'potential' look like for each?", activityTitle: "Per-Category Screening Criteria Definition" },
        { text: "Define mode of engagement per category — internship, seed fund, early-stage grant, etc.", activityTitle: "Engagement Mode Definition" },
        { text: "Define 12–18 month pathway for Category A (freshers): intern → incubation → seed-stage", activityTitle: "Category A Pathway Definition" },
        { text: "Define 12–18 month pathway for Category B/C: seed fund → early-stage grant", activityTitle: "Category B/C Pathway Definition" },
        { text: "Revisit Category D (young orgs) — current experience weak; identify revised support structure", activityTitle: "Category D Support Structure Review" },
        { text: "Set priority order across categories (Category E is last priority currently)", activityTitle: "Category Priority Order Setting" },
        { text: "Link sourcing targets to geo demand map — which categories for which geographies?", activityTitle: "Sourcing Targets to Demand Map Linking" },
        { text: "Share draft framework with Geo teams for feedback", activityTitle: "Framework Draft Geo Team Review" },
        { text: "Finalise framework — document and circulate to all stakeholders", activityTitle: "Sourcing Framework Finalisation" },
      ],
    },
    {
      title: "Capacity Building Approach Decision",
      type: "Meeting",
      notes: `Decide how capacity building support will be structured for seeded organisations. Three options discussed: (1) through the URC, (2) through mentor organisations, (3) through dedicated teams in Geo teams. These are not mutually exclusive. Decision should factor in cost, quality, proximity to the seeded org, and Geo team bandwidth.`,
      startSlaDays: 30,
      slaDays: 60,
      checklist: [
        { text: "Map current URC capacity and willingness to support seeded organisations", activityTitle: "URC Capacity Assessment" },
        { text: "Identify potential mentor organisations per geography/theme", activityTitle: "Mentor Organisation Identification" },
        { text: "Assess Geo team bandwidth for dedicated handholding", activityTitle: "Geo Team Bandwidth Assessment" },
        { text: "Present options and tradeoffs to programme leadership for decision", activityTitle: "Capacity Building Options Presentation" },
        { text: "Draft capacity building plan for the first cohort based on chosen approach", activityTitle: "First Cohort Capacity Building Plan" },
        { text: "Document decision and rationale — share with Geo teams", activityTitle: "Decision Documentation and Sharing" },
      ],
    },
    {
      title: "Sourcing & Screening — Build Pipeline",
      type: "Milestone",
      notes: `Activate sourcing channels and build a pipeline of ${cohort * 4}–${cohort * 6} candidates (targeting a ${cohort}-person/org cohort, assuming ~4–6× funnel). Sourcing and screening are held centrally. Geo teams are consulted on fit with local demand. Screening distinguishes genuine motivation and potential from surface interest.`,
      startSlaDays: 45,
      slaDays: 90,
      checklist: [
        { text: "Activate sourcing channels per category — reach out to colleges, networks, partner orgs", activityTitle: "Sourcing Channel Activation" },
        { text: `Build initial pipeline of ${cohort * 4}–${cohort * 6} candidates across categories`, activityTitle: "Pipeline Building Outreach" },
        { text: "Design screening process: application, conversation, reference check", activityTitle: "Screening Process Design" },
        { text: "Conduct first-round screening conversations with all applicants", activityTitle: "First-Round Screening Conversations" },
        { text: "Involve Geo teams in assessing fit with local demand and context", activityTitle: "Geo Team Candidate Fit Assessment" },
        { text: "Shortlist candidates — document rationale per shortlisted person/org", activityTitle: "Candidate Shortlisting" },
        { text: "Conduct deeper assessment for shortlisted candidates (second conversation / field visit)", activityTitle: "Deep Assessment of Shortlisted Candidates" },
        { text: `Finalise cohort of ${cohort} candidates — document selection rationale`, activityTitle: "Final Cohort Selection" },
      ],
    },
    {
      title: "Cohort Onboarding & Placement",
      type: "Milestone",
      notes: `Onboard the first seeding cohort. Category A (freshers): place as interns with partner organisations for 12–18 months. Category B/C (alumni/youth leaders): typically placed in home states/districts with a 12–18 month seed fund, followed by early-stage grant. Each seeded individual/org gets a designated Geo team contact for handholding. Balance between over-involvement and under-support is critical.`,
      startSlaDays: 75,
      slaDays: 120,
      checklist: [
        { text: "Confirm placement details with each cohort member — host org (if intern) or geography (if seeding)", activityTitle: "Cohort Placement Confirmation" },
        { text: "Issue seed fund agreements / internship letters as applicable", activityTitle: "Agreement and Letter Issuance", completionType: "Upload" },
        { text: "Assign Geo team contact per cohort member for handholding", activityTitle: "Geo Team Contact Assignment" },
        { text: "Conduct onboarding orientation — explain expectations, support available, review cadence", activityTitle: "Cohort Onboarding Orientation", completionType: "Voice" },
        { text: "Set up 12–18 month engagement calendar for each cohort member", activityTitle: "Cohort Engagement Calendar Setup" },
        { text: "Define what 'progress' looks like at 3, 6, 12 months for each cohort member", activityTitle: "Cohort Milestone Definition" },
        { text: "Introduce cohort members to each other — enable peer learning", activityTitle: "Cohort Peer Introduction" },
        { text: "Document cohort baseline: motivation, skills, context, stated goals", activityTitle: "Cohort Baseline Documentation" },
      ],
    },
    {
      title: "Review & Monitoring Cadence",
      type: "Milestone",
      notes: `Establish a structured review rhythm to track progress without over-controlling. Weekly Friday meeting tracks operational progress. Quarterly review assesses cohort progress at a deeper level. Seeded orgs/individuals should feel supported but not suffocated — the review process should be light-touch and developmental rather than compliance-oriented.`,
      startSlaDays: 14,
      slaDays: 90,
      checklist: [
        { text: "Weekly Friday 9am check-in: pipeline status, blockers, decisions needed", activityTitle: "Weekly Friday Pipeline Check-in" },
        { text: "Set up cohort tracking tracker: status per member, support given, milestones hit", activityTitle: "Cohort Tracking Sheet Setup" },
        { text: "Monthly check-in with each cohort member (Geo team lead)", activityTitle: "Monthly Cohort Member Check-in" },
        { text: "Quarterly programme review: cohort progress, framework learnings, adjustments needed", activityTitle: "Quarterly Seeding Programme Review" },
        { text: "Define early warning indicators — what signals a cohort member is struggling?", activityTitle: "Early Warning Indicator Definition" },
        { text: "Define exit/graduation criteria — when is a seeded org ready for the next stage?", activityTitle: "Graduation Criteria Definition" },
        { text: "Document learnings after first cohort — inform second cohort design", activityTitle: "First Cohort Learnings Documentation" },
      ],
    },
  ];
}

// ── Scheme Linkage & Entitlements Drive Template ─────────────────────────────

function buildSchemeLinkageTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const hh = Number(params.households) || 625;
  const cos = Math.ceil(hh / 625);          // 1 CO per 625 HH
  const acs = Math.ceil(cos / 3);           // 1 Area Coordinator per 3–4 COs
  const rccs = Math.max(1, acs);            // 1 Resource Centre Coordinator per AC cluster

  return [
    {
      title: "Team Deployment & Scheme Training",
      type: "Training",
      notes: `Assign and train the field team for ${hh.toLocaleString()} households. Staff needed: 1 Programme Manager, ${cos} Community Organiser(s) (1 per 625 HH), ${acs} Area Coordinator(s) (1 per 3–4 COs), ${rccs} Resource Centre Coordinator(s) (1 per RCC), 1 MIS Coordinator. Training covers: eligibility criteria for each scheme, required documents, application process (online/offline), common rejection reasons, how to update household MIS, and daily plan generation logic.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        { text: "Assign Programme Manager (1 overall)", activityTitle: "Programme Manager Assignment" },
        { text: `Assign ${cos} Community Organiser(s) (1 per 625 HH)`, activityTitle: "Community Organiser Assignment" },
        { text: `Assign ${acs} Area Coordinator(s) (1 per 3–4 COs)`, activityTitle: "Area Coordinator Assignment" },
        { text: `Assign ${rccs} Resource Centre Coordinator(s) (1 per RCC)`, activityTitle: "RCC Assignment" },
        { text: "Assign MIS Coordinator (1 overall)", activityTitle: "MIS Coordinator Assignment" },
        { text: "Conduct 3-day induction: scheme eligibility, document checklist, application process", activityTitle: "Team Scheme Training", completionType: "Voice" },
        { text: "Train on CMCHIS / PMJAY: eligibility (income <₹72k/year), docs (Aadhaar + Income cert), 1467 empanelled hospitals", activityTitle: "CMCHIS/PMJAY Training", completionType: "Voice" },
        { text: "Train on PMJJBY: ₹2L life insurance @₹436/year, needs bank account, age 18–50", activityTitle: "PMJJBY Scheme Training", completionType: "Voice" },
        { text: "Train on PMSBY: ₹2L accident insurance @₹20/year, needs bank account, age 18–70", activityTitle: "PMSBY Scheme Training", completionType: "Voice" },
        { text: "Train on APY: pension ₹1k–5k/month on retirement, age 18–40, bank account needed", activityTitle: "APY Scheme Training", completionType: "Voice" },
        { text: "Train on state welfare pensions: old age (60+), widow, disability (UDID required)", activityTitle: "Welfare Pension Scheme Training", completionType: "Voice" },
        { text: "Train on PMAY: housing subsidy for homeless/kachha house, Aadhaar + income cert + land doc", activityTitle: "PMAY Housing Scheme Training", completionType: "Voice" },
        { text: "Train on NFSA / ration card: PHH (5 kg/person @₹3/kg), AAY for destitute", activityTitle: "NFSA Ration Card Training", completionType: "Voice" },
        { text: "Train on Jan Dhan: zero-balance account, RuPay card, Aadhaar seeding for DBT", activityTitle: "Jan Dhan Account Training", completionType: "Voice" },
        { text: "Identify and note key government contacts per scheme: taluk office, CMCHIS help desk, bank BC agent", activityTitle: "Government Scheme Contacts Identification" },
        { text: "Set up team WhatsApp group for daily updates and issue escalation", activityTitle: "Team WhatsApp Group Setup" },
      ],
    },
    {
      title: "Settlement Mapping & Household Linelisting",
      type: "Milestone",
      notes: `Build a complete household register for the settlement. Sketch or GPS-map each street/lane. Enumerate every household: head name, family members (name/age/gender), address, and contact number. This linelist is the foundation of all subsequent scheme-tracking work.`,
      startSlaDays: 7,
      slaDays: 35,
      checklist: [
        { text: "Prepare or verify settlement map — identify all streets/lanes/blocks", activityTitle: "Settlement Map Verification" },
        { text: "Assign streets to each CO for systematic door-to-door coverage", activityTitle: "Street-to-CO Assignment" },
        { text: "Enumerate all households: head of household name, address, mobile number", activityTitle: "Household Door-to-Door Enumeration", completionType: "Voice" },
        { text: "List all family members: name, age, gender, relationship to head", activityTitle: "Family Member Listing" },
        { text: "Note if household is tenant or owner; approximate house structure (pucca/kachha/kutcha)", activityTitle: "House Type and Tenure Recording" },
        { text: "Flag vulnerable households: elderly (60+) living alone, widows, PwD, single women HH, destitute", activityTitle: "Vulnerable Household Flagging" },
        { text: "Enter all households into MIS (Frappe / field app)", activityTitle: "Household MIS Data Entry" },
        { text: "Review coverage — ensure no street/lane missed; verify count against any existing community data", activityTitle: "Coverage Completeness Review" },
        { text: `Confirm final linelist count against target (${hh} HH)`, activityTitle: "Final Linelist Count Confirmation" },
      ],
    },
    {
      title: "Baseline Entitlement Survey",
      type: "Milestone",
      notes: `Survey every household to map current entitlement status and document gaps. Per-household fields: CMCHIS/PMJAY status, ration card type (AAY/PHH/SPHH/none), Jan Dhan bank account, social security schemes enrolled (PMJJBY/PMSBY/APY), pension status, housing type, voter ID status, and which Aadhaar/income/caste certificates are present. This drives scheme-wise priority lists in the MIS.`,
      startSlaDays: 21,
      slaDays: 50,
      checklist: [
        { text: "Design or finalise baseline survey form — cover all schemes and document fields", activityTitle: "Baseline Survey Form Design", completionType: "Voice" },
        { text: "Conduct survey for all listed households (attach to existing linelist records)", activityTitle: "Household Baseline Survey", completionType: "Voice" },
        { text: "Record per HH: ration card number and type (AAY / PHH / SPHH / none)", activityTitle: "Ration Card Status Survey" },
        { text: "Record per HH: CMCHIS / PMJAY status (Active / Applied / Not Applied)", activityTitle: "Health Insurance Status Survey" },
        { text: "Record per individual: Jan Dhan or bank account (Yes/No), account number if yes", activityTitle: "Bank Account Status Survey" },
        { text: "Record per individual: PMJJBY enrolled (Y/N), PMSBY enrolled (Y/N), APY enrolled (Y/N)", activityTitle: "Social Security Enrollment Survey" },
        { text: "Record per eligible elderly/widow/PwD: pension status and pension amount if receiving", activityTitle: "Pension Status Survey" },
        { text: "Record per individual: voter ID present (Y/N), correct address (Y/N)", activityTitle: "Voter ID Status Survey" },
        { text: "Record per HH: house type (pucca/semi-pucca/kachha) — flag kachha/homeless for PMAY", activityTitle: "Housing Type Survey" },
        { text: "Record per individual: Aadhaar present (Y/N), mobile seeded (Y/N), name/DOB correct (Y/N)", activityTitle: "Aadhaar Status Survey" },
        { text: "Record per individual: income certificate present (Y/N), date of issue", activityTitle: "Income Certificate Status Survey" },
        { text: "Record per individual: caste/community certificate present (Y/N) where applicable", activityTitle: "Caste Certificate Status Survey" },
        { text: "Update MIS with survey data; generate scheme-wise gap reports", activityTitle: "Baseline Survey MIS Update" },
        { text: "Brief Area Coordinators on household priority lists per scheme", activityTitle: "AC Priority List Briefing" },
      ],
    },
    {
      title: "Document Foundation Drive (Aadhaar, Income Cert, Ration Card, Jan Dhan)",
      type: "Milestone",
      notes: `Documents are the common bottleneck across all schemes. Prioritise this before scheme-specific drives. Key work: Aadhaar corrections and mobile seeding, Income Certificate applications and renewals (4-day ETA at TN taluk offices), Ration Card family member updates, Jan Dhan zero-balance account opening. Run document camps to batch-process multiple households in a day.`,
      startSlaDays: 35,
      slaDays: 80,
      checklist: [
        { text: "Identify households with Aadhaar gaps from baseline — missing, incorrect name/DOB, mobile not seeded", activityTitle: "Aadhaar Gap Household Identification" },
        { text: "Organise Aadhaar correction/enrollment camp or schedule CO-accompanied trips to Aadhaar centre", activityTitle: "Document Camp" },
        { text: "Seed mobile number to Aadhaar for DBT linkage (UIDAI portal or Aadhaar centre)", activityTitle: "Aadhaar Mobile Seeding" },
        { text: "Identify households needing Income Certificate (new application or renewal/expired)", activityTitle: "Income Certificate Gap Identification" },
        { text: "Batch-apply Income Certificates at taluk office — track ETA (typically 4 days)", activityTitle: "Batch Income Certificate Applications" },
        { text: "Follow up on pending Income Certs — escalate delays beyond 10 days to supervisor", activityTitle: "Income Certificate Follow-up" },
        { text: "Flag expired Income Certs — re-apply immediately (blocks CMCHIS)", activityTitle: "Expired Income Certificate Re-application" },
        { text: "Review ration cards — identify non-members, newborns, new members needing addition", activityTitle: "Ration Card Member Review" },
        { text: "Support ration card family member additions at TNPDS / PDS office", activityTitle: "Ration Card Member Addition Support" },
        { text: "Identify households with AAY eligibility not yet upgraded from PHH — support reclassification", activityTitle: "AAY Reclassification Support" },
        { text: "Identify adults without Jan Dhan/bank account; coordinate with nearest bank BC agent or branch", activityTitle: "Unbanked Adult Identification" },
        { text: "Open zero-balance Jan Dhan accounts; ensure RuPay debit card issued", activityTitle: "Jan Dhan Account Opening" },
        { text: "Link Aadhaar to bank account for DBT (required for pension, PMAY, PMJJBY/PMSBY auto-debit)", activityTitle: "Aadhaar–Bank DBT Linkage" },
        { text: "Track document status per household/individual in MIS — update after each completion", activityTitle: "Document Status MIS Update" },
      ],
    },
    {
      title: "Health Insurance Enrollment Drive (CMCHIS / PMJAY)",
      type: "Milestone",
      notes: `Primary health insurance enrollment for all eligible households. CMCHIS (TN): ₹5 lakh/year per family, requires Aadhaar + Income Cert (income <₹72,000/year), 1,467 empanelled hospitals. PMJAY (Ayushman Bharat): ₹5 lakh/year for SECC-listed households — check beneficiary status on PMJAY portal. Run CO daily plan (30 HH/day) prioritising doc-ready households. Track: not applied → applied → active; rejected → re-applied.`,
      startSlaDays: 50,
      slaDays: 100,
      checklist: [
        { text: "Generate MIS list: households with Aadhaar Received AND Income Cert Received — highest priority", activityTitle: "Doc-Ready Household Priority List Generation" },
        { text: "Run CO daily plan (30 HH/day) starting with doc-ready households", activityTitle: "CMCHIS CO Daily Household Visits", completionType: "Voice" },
        { text: "Accompany or guide HH head to nearest CMCHIS enrollment centre with documents", activityTitle: "CMCHIS Enrollment Centre Visit", completionType: "Voice" },
        { text: "Check PMJAY beneficiary status for each HH on pmjay.gov.in — eligible HH enrolled directly", activityTitle: "PMJAY Beneficiary Status Check" },
        { text: "Record CMCHIS / PMJAY application number and expected activation date in MIS", activityTitle: "CMCHIS Application MIS Recording" },
        { text: "Follow up on Applied HH after 5-day ETA — check activation status", activityTitle: "CMCHIS Application Follow-up" },
        { text: "Investigate rejected cases: reason for rejection (income limit, name mismatch, duplicate)", activityTitle: "CMCHIS Rejection Investigation" },
        { text: "Correct docs for rejected cases and re-apply — track as second application in MIS", activityTitle: "CMCHIS Rejection Correction and Re-application" },
        { text: "Inform activated families: how to use card, nearest empanelled hospitals, cashless process", activityTitle: "CMCHIS Card Usage Briefing" },
        { text: "Notify Aadhaar-pending and Income-cert-pending HH of their blocking item — route to Document Drive", activityTitle: "Pending Document Household Notification" },
        { text: "Track overall pipeline: Not Applied / Docs Pending / Applied / Active / Rejected", activityTitle: "CMCHIS Pipeline Status Tracking" },
      ],
    },
    {
      title: "Social Security Scheme Drive (PMJJBY / PMSBY / APY)",
      type: "Milestone",
      notes: `Bank-account-linked social security for individuals — best enrolled in a camp with bank BC agent. PMJJBY: ₹2L life insurance @₹436/year auto-debited, age 18–50, bank account needed. PMSBY: ₹2L accident insurance @₹20/year, age 18–70, bank account needed. APY: state pension ₹1k–5k/month on retirement based on contribution, age 18–40, bank account needed. These are individual-level enrollments — target every eligible adult.`,
      startSlaDays: 70,
      slaDays: 120,
      checklist: [
        { text: "Generate MIS list: adults aged 18–50 with bank account but not enrolled in PMJJBY", activityTitle: "PMJJBY Eligible Adult List Generation" },
        { text: "Generate MIS list: adults aged 18–70 with bank account but not enrolled in PMSBY", activityTitle: "PMSBY Eligible Adult List Generation" },
        { text: "Generate MIS list: adults aged 18–40 in informal sector — APY candidates", activityTitle: "APY Candidate List Generation" },
        { text: "Coordinate with nearest bank BC agent or branch to run enrollment camp in the settlement", activityTitle: "Bank BC Agent Enrollment Camp Coordination" },
        { text: "Enroll eligible adults in PMJJBY — fill nomination form, confirm auto-debit set up", activityTitle: "PMJJBY Enrollment Drive" },
        { text: "Enroll eligible adults in PMSBY — same session, ₹20/year, confirm auto-debit", activityTitle: "PMSBY Enrollment Drive" },
        { text: "Enroll interested youth/adults in APY — explain contribution tiers (₹42–₹291/month) and pension amounts", activityTitle: "APY Enrollment Drive" },
        { text: "Update MIS: PMJJBY enrolled (Y/N), PMSBY enrolled (Y/N), APY enrolled (Y/N) per individual", activityTitle: "Social Security Enrollment MIS Update" },
        { text: "Brief families: what PMJJBY covers (death/natural cause), claim process, nominee importance", activityTitle: "PMJJBY Benefits Briefing" },
        { text: "Brief families: what PMSBY covers (accident death + disability), claim process", activityTitle: "PMSBY Benefits Briefing" },
        { text: "Follow up: confirm bank statements show first auto-debit for PMJJBY/PMSBY", activityTitle: "PMJJBY/PMSBY Auto-Debit Confirmation" },
      ],
    },
    {
      title: "Welfare Pension & Disability Entitlements Drive",
      type: "Milestone",
      notes: `State and central pension schemes for elderly, widows, and persons with disability. Old Age Pension (TN IGNOAPS): ₹1,000/month for age 60+, income-poor households — apply at Village Administrative Officer (VAO) or Taluk office. Widow Pension (IGNWPS): ₹1,000/month, apply similarly. UDID (Unique Disability ID): national disability card enabling reservations, travel concessions, scheme access — requires govt medical board assessment.`,
      startSlaDays: 70,
      slaDays: 130,
      checklist: [
        { text: "Identify elderly (60+) not receiving any pension from baseline survey", activityTitle: "Unpensioned Elderly Identification" },
        { text: "Verify income eligibility — old age pension targets landless, income-poor HH", activityTitle: "Old Age Pension Eligibility Verification" },
        { text: "Support application at Taluk office / VAO: Aadhaar, bank passbook, age proof, income cert", activityTitle: "Old Age Pension Application Support" },
        { text: "Identify widows not receiving widow pension — support IGNWPS application", activityTitle: "Widow Pension Application Support" },
        { text: "Track pension applications: submitted → approved → first payment received in MIS", activityTitle: "Pension Application Status Tracking" },
        { text: "Identify PwD (persons with disability) from baseline — confirm disability type", activityTitle: "PwD Identification from Baseline" },
        { text: "Support visit to nearest govt hospital for disability certificate / medical board assessment", activityTitle: "Disability Certificate Medical Board Visit", completionType: "Voice" },
        { text: "Facilitate UDID card enrollment at udid.gov.in after disability certificate issued", activityTitle: "UDID Card Enrollment Support" },
        { text: "Identify PwD with UDID eligible for disability pension — apply at Taluk office", activityTitle: "Disability Pension Application Support" },
        { text: "Brief families on UDID benefits: reservations, concessional travel, PDS priority, scheme access", activityTitle: "UDID Benefits Briefing" },
        { text: "Update MIS: pension status (not applied / applied / approved / receiving) per individual", activityTitle: "Pension Status MIS Update" },
      ],
    },
    {
      title: "Housing, Voter ID & Civic Entitlements Drive",
      type: "Milestone",
      notes: `PMAY (Pradhan Mantri Awas Yojana): ₹1.2–2.5L subsidy for homeless or kachha-house families — Aadhaar, income cert, land document needed; apply at panchayat/municipality. Voter ID: enroll unregistered adults (Form 6 at BLO or online on voters.eci.gov.in). Property/Patta: support where settlement has been regularised. Civic gaps (water, sanitation, street lights) — coordinate with WRP/Welfare Rights team for systemic follow-up.`,
      startSlaDays: 90,
      slaDays: 150,
      checklist: [
        { text: "Identify households in kachha/kutcha house or homeless from baseline — flag for PMAY", activityTitle: "PMAY Eligible Household Identification" },
        { text: "Check if settlement appears in PMAY beneficiary list (AwaasSoft portal or municipality)", activityTitle: "PMAY Beneficiary List Check" },
        { text: "Support PMAY application: Aadhaar, income cert, photo, bank account, land/possession document", activityTitle: "PMAY Application Support" },
        { text: "Track PMAY applications: applied → approved → construction linked payment (CLP)", activityTitle: "PMAY Application Status Tracking" },
        { text: "Identify adults without voter ID or with wrong address — support Form 6 or correction application", activityTitle: "Voter ID Gap Identification" },
        { text: "Conduct voter ID enrollment/correction camp (or schedule BLO visit to settlement)", activityTitle: "Voter ID Enrollment Camp" },
        { text: "Track voter ID status per adult in MIS (not enrolled / applied / received)", activityTitle: "Voter ID Status MIS Tracking" },
        { text: "Identify households without piped water connection — document and hand over to civic action team", activityTitle: "Water Connection Gap Documentation" },
        { text: "Identify households without individual toilet / open defecation — SBM linkage if settlement eligible", activityTitle: "Toilet Gap and SBM Linkage" },
        { text: "Identify streets without street lights / road repair needs — escalate to Ward Councillor / municipality", activityTitle: "Streetlight and Road Gap Escalation" },
        { text: "Update MIS: PMAY status, voter ID status, civic gap flags per household", activityTitle: "Housing and Civic Status MIS Update" },
      ],
    },
    {
      title: "Ongoing Followup & Pipeline Tracking",
      type: "Milestone",
      notes: `Continuous CO-led household followup driven by MIS priority lists — same model as CMCHIS daily work plan (30 HH/day per CO, pool-based prioritisation). Priority pools: (1) households with zero scheme coverage, (2) households with docs ready but applications pending, (3) households with overdue follow-up / pending status, (4) recently activated — check experience and address issues. Refresh MIS after each visit.`,
      startSlaDays: 50,
      slaDays: 180,
      checklist: [
        { text: "Set up MIS daily plan generation — pools based on scheme coverage gaps and doc readiness", activityTitle: "MIS Daily Plan Generation Setup" },
        { text: "Confirm COs running 30 HH visits/day per daily plan", activityTitle: "CO Daily Visit Rate Confirmation" },
        { text: "Weekly review: % households with CMCHIS active, PMJJBY, PMSBY, APY enrolled", activityTitle: "Weekly Scheme Coverage Review" },
        { text: "Weekly review: income cert pipeline — pending, applied, received, expired", activityTitle: "Weekly Income Cert Pipeline Review" },
        { text: "Weekly review: Aadhaar pipeline — missing, correction pending, received", activityTitle: "Weekly Aadhaar Pipeline Review" },
        { text: "Track rejection rate per scheme — investigate if >10% rejections for any scheme", activityTitle: "Scheme Rejection Rate Tracking" },
        { text: "Track households with zero scheme coverage — these are highest priority", activityTitle: "Zero-Coverage Household Tracking" },
        { text: "Ensure newborns, new migrants, and newly-identified HH are onboarded to MIS", activityTitle: "New Household MIS Onboarding" },
        { text: "Handle mid-year Income Cert expiry — re-apply before CMCHIS renewal deadline", activityTitle: "Income Cert Expiry Re-application" },
        { text: "Monthly Area Coordinator review: scheme-wise pipeline, CO coverage rate, blockers", activityTitle: "Monthly AC Pipeline Review" },
      ],
    },
    {
      title: "Community Review & Grievance Redressal",
      type: "Meeting",
      notes: `Monthly community meetings to share entitlement progress and collect grievances. Grievance types: scheme denial without valid reason, corruption/bribery at government offices, application delays beyond SLA, wrong rejection (name mismatch, manual error). Escalation path: verbal → written complaint → senior official → RTI. Jan Sunwai (public hearing) for systemic denial affecting many households.`,
      startSlaDays: 60,
      slaDays: 180,
      checklist: [
        { text: "Schedule monthly community meeting — share scheme enrollment numbers and pending list", activityTitle: "Community Review & Grievance Meeting", completionType: "Voice" },
        { text: "Collect grievances: households denied schemes, bribery demands, application delays", activityTitle: "Grievance Collection" },
        { text: "Categorise grievances: individual (name mismatch, doc issue) vs systemic (policy/process gap)", activityTitle: "Grievance Categorisation" },
        { text: "Resolve individual cases: write application to concerned officer with supporting docs", activityTitle: "Individual Grievance Resolution" },
        { text: "Escalate systemic issues to District Officer / Collector with documented evidence", activityTitle: "Systemic Issue Escalation to District Officer" },
        { text: "Track grievance status in MIS: raised → escalated → resolved", activityTitle: "Grievance Status MIS Tracking" },
        { text: "File RTI application for scheme-specific denial data if systemic pattern identified", activityTitle: "RTI Application Filing" },
        { text: "Organise Jan Sunwai (public hearing) if large number of HH denied same scheme", activityTitle: "Jan Sunwai Organisation", completionType: "Voice" },
        { text: "Document success stories — households that received CMCHIS and actually used it at hospital", activityTitle: "Success Story Documentation" },
        { text: "Share quarterly progress report with programme leadership: scheme coverage %, pending, grievances", activityTitle: "Quarterly Scheme Coverage Report" },
      ],
    },
  ];
}

// ── Elderly Care Centre Template ─────────────────────────────────────────────

function buildElderlyCentreTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const track = String(params.track || "new");

  const monthlyReview: PitstopTemplate = {
    title: "Monthly Reflection, Review and Course-Correction Rhythm Institutionalised",
    type: "Review",
    progressTag: "Monitoring",
    recurrence: "Monthly",
    notes: "Monthly reflection and review meeting to track progress, surface blockers, and convert learnings into corrective actions.",
    startSlaDays: track === "new" ? 60 : 0,
    slaDays: track === "new" ? 90 : 30,
    checklist: [
      { text: "Monthly reviews recurring", activityTitle: "Monthly Programme Review" },
      { text: "Issue tracker active", activityTitle: "Issue Tracker Maintenance" },
      { text: "Corrective actions followed up", activityTitle: "Corrective Action Follow-up" },
      { text: "Learnings converted to actions", activityTitle: "Learning-to-Action Conversion" },
    ],
  };

  if (track === "existing") {
    return [
      monthlyReview,
      {
        title: "Minimum Service Standards Functional Across All Clusters",
        type: "Review",
        progressTag: "Monitoring",
        recurrence: "Monthly",
        notes: "Verify that minimum service standards are consistently met across all clusters: assessments complete, home visits active, referral systems functioning, forums started, and MIS reporting live.",
        startSlaDays: 0,
        slaDays: 30,
        checklist: [
          { text: "Assessments completed", activityTitle: "Elderly Assessment Completion Verification" },
          { text: "Home visits active", activityTitle: "Home Visit System Verification" },
          { text: "Referral systems active", activityTitle: "Referral System Verification" },
          { text: "Forums started", activityTitle: "Elder Forum Activation Check" },
          { text: "MIS reporting active in all clusters", activityTitle: "MIS Reporting Activity Check" },
        ],
      },
    ];
  }

  return [
    {
      title: "Partner Alignment, Roles and Rollout Roadmap in Place",
      type: "Meeting",
      progressTag: "Permissions",
      notes: "Align implementing and technical partners on roles, cluster ownership, and the rollout roadmap before any field work begins.",
      startSlaDays: 0,
      slaDays: 14,
      checklist: [
        { text: "Implementing partner roles clarified", activityTitle: "Partner Roles Clarification Meeting" },
        { text: "Technical partner coordination structure clarified", activityTitle: "Technical Partner Coordination Setup" },
        { text: "Cluster ownership mapped", activityTitle: "Cluster Ownership Mapping" },
        { text: "Rollout roadmap shared", activityTitle: "Rollout Roadmap Sharing" },
      ],
    },
    {
      title: "Recruitment, Deployment and Reporting Structure in Place",
      type: "Milestone",
      progressTag: "Team",
      notes: "Recruit and deploy the full programme team across all clusters with clear reporting lines.",
      startSlaDays: 7,
      slaDays: 30,
      checklist: [
        { text: "JDs circulated", activityTitle: "JD Circulation" },
        { text: "Partner recruitment substantially completed", activityTitle: "Partner Recruitment Progress Check" },
        { text: "Technical partner staffing available", activityTitle: "Technical Partner Staffing Confirmation" },
        { text: "Cluster deployment completed", activityTitle: "Cluster Deployment Completion Check" },
        { text: "Reporting lines clear", activityTitle: "Reporting Lines Clarification" },
      ],
    },
    {
      title: "MIS Modules, Dashboards and Reporting Rhythm in Place",
      type: "Milestone",
      progressTag: "Infrastructure",
      notes: "Deploy MIS modules covering elder profiles, assessment forms, and dashboards. Establish monthly reporting format.",
      startSlaDays: 14,
      slaDays: 45,
      checklist: [
        { text: "Elder profile module ready", activityTitle: "Elder Profile MIS Module Setup" },
        { text: "Assessment form live", activityTitle: "Assessment Form Deployment" },
        { text: "Dashboards active", activityTitle: "MIS Dashboard Activation" },
        { text: "Monthly reporting format available", activityTitle: "Monthly Report Format Setup" },
      ],
    },
    {
      title: "Core Tools, Formats and First-Cut SOP Pack in Place",
      type: "Milestone",
      progressTag: "Infrastructure",
      notes: "Prepare all field tools, visit formats, categorisation logic, and a first-cut SOP pack before field work begins.",
      startSlaDays: 14,
      slaDays: 45,
      checklist: [
        { text: "Assessment tools ready", activityTitle: "Assessment Tools Preparation" },
        { text: "Categorisation logic available", activityTitle: "Categorisation Logic Documentation" },
        { text: "Visit formats ready", activityTitle: "Visit Format Preparation" },
        { text: "First SOP pack shared", activityTitle: "First SOP Pack Distribution" },
      ],
    },
    {
      title: "Exposure Visits, Orientation and Field Familiarisation Completed",
      type: "Training",
      progressTag: "Training",
      notes: "All field staff complete exposure visits to reference sites, orientation sessions, and field familiarisation before beginning assessments.",
      startSlaDays: 30,
      slaDays: 60,
      checklist: [
        { text: "Exposure visits completed", activityTitle: "Staff Exposure Visit", completionType: "Voice" },
        { text: "Orientation sessions completed", activityTitle: "Staff Orientation Sessions", completionType: "Voice" },
        { text: "Field familiarisation completed", activityTitle: "Field Familiarisation Exercise" },
        { text: "Learnings documented", activityTitle: "Exposure Learning Documentation" },
      ],
    },
    {
      title: "Assessment Pilot Completed and Field Tools Refined",
      type: "Research",
      progressTag: "Baseline",
      notes: "Run a pilot assessment in one cluster to test tools, identify bottlenecks, and refine formats before full rollout.",
      startSlaDays: 45,
      slaDays: 75,
      checklist: [
        { text: "Pilot assessments completed", activityTitle: "Assessment Pilot" },
        { text: "Field bottlenecks reviewed", activityTitle: "Pilot Field Bottleneck Review" },
        { text: "Tool refinements completed", activityTitle: "Assessment Tool Refinements" },
        { text: "Full rollout ready", activityTitle: "Full Rollout Readiness Confirmation" },
      ],
    },
    {
      title: "Full Elderly Assessments Rolled Out Across All Clusters",
      type: "Milestone",
      progressTag: "Baseline",
      notes: "Roll out elderly assessments across all clusters. Monitor daily progress and track productivity to ensure coverage targets are met.",
      startSlaDays: 60,
      slaDays: 90,
      checklist: [
        { text: "Assessments started in all clusters", activityTitle: "Cluster Assessment Rollout Confirmation" },
        { text: "Daily progress monitoring active", activityTitle: "Daily Assessment Progress Monitoring" },
        { text: "Productivity tracking active", activityTitle: "Assessment Productivity Tracking Setup" },
      ],
    },
    {
      title: "Cluster-wise Assessments Completed and Data Quality Stabilised",
      type: "Review",
      progressTag: "Baseline",
      notes: "Complete assessments across all clusters, clean the data, and confirm a final usable dataset before categorisation.",
      startSlaDays: 75,
      slaDays: 105,
      checklist: [
        { text: "Coverage targets reached", activityTitle: "Assessment Coverage Target Verification" },
        { text: "Pending assessments minimized", activityTitle: "Pending Assessments Clearance" },
        { text: "Data cleaned", activityTitle: "Assessment Data Cleaning" },
        { text: "Final usable dataset available", activityTitle: "Final Dataset Confirmation" },
      ],
    },
    {
      title: "Elderly Categorisation and Priority Care Planning in Place",
      type: "Review",
      progressTag: "Baseline",
      notes: "Segment all assessed elderly by need level and assign initial care plans. Flag priority elderly for immediate intervention.",
      startSlaDays: 90,
      slaDays: 120,
      checklist: [
        { text: "Elders segmented by need level", activityTitle: "Elder Need Level Segmentation" },
        { text: "Priority elderly flagged", activityTitle: "Priority Elderly Flagging" },
        { text: "Initial care plans assigned", activityTitle: "Initial Care Plan Assignment" },
      ],
    },
    {
      title: "Community Worker Home Visit and Follow-up System Operational",
      type: "Milestone",
      progressTag: "Live",
      notes: "Define visit frequency norms, allocate workers to elderly, and activate home visit tracking and escalation pathways.",
      startSlaDays: 100,
      slaDays: 135,
      checklist: [
        { text: "Visit frequency norms defined", activityTitle: "Home Visit Frequency Norms Setup" },
        { text: "Worker allocation completed", activityTitle: "Worker-to-Elder Allocation" },
        { text: "Home visit tracking active", activityTitle: "Home Visit Tracking Setup" },
        { text: "Escalation pathway functioning", activityTitle: "Care Escalation Pathway Verification" },
      ],
    },
    {
      title: "City Service Mapping and Referral Pathways Established",
      type: "Research",
      progressTag: "Permissions",
      notes: "Map all relevant health facilities and service providers. Create a referral directory and document pathways for health, palliative, and social care referrals.",
      startSlaDays: 90,
      slaDays: 120,
      checklist: [
        { text: "Health facilities mapped", activityTitle: "Service Mapping Visit" },
        { text: "Service directory created", activityTitle: "Service Directory Creation" },
        { text: "Referral contacts listed", activityTitle: "Referral Contact Listing" },
        { text: "Pathways documented", activityTitle: "Referral Pathway Documentation" },
      ],
    },
    {
      title: "Health, Palliative and Critical Care Linkage System Operational",
      type: "Milestone",
      progressTag: "Live",
      notes: "Activate priority referrals, confirm the follow-up system is working, and ensure a crisis response pathway is in place.",
      startSlaDays: 110,
      slaDays: 140,
      checklist: [
        { text: "Priority referrals started", activityTitle: "Priority Health Referrals Activation" },
        { text: "Follow-up system active", activityTitle: "Referral Follow-up System Activation" },
        { text: "Crisis response pathway active", activityTitle: "Crisis Response Pathway Activation" },
      ],
    },
    {
      title: "Day Care Need Assessment, Site Feasibility and Rollout Plan in Place",
      type: "Research",
      progressTag: "Baseline",
      notes: "Identify clusters with highest day care need, shortlist sites, complete feasibility checks, and prepare a rollout plan.",
      startSlaDays: 90,
      slaDays: 120,
      checklist: [
        { text: "Need-based clusters identified", activityTitle: "Day Care Need Cluster Identification" },
        { text: "Sites shortlisted", activityTitle: "Day Care Site Shortlisting" },
        { text: "Feasibility completed", activityTitle: "Day Care Feasibility Assessment" },
        { text: "Rollout plan prepared", activityTitle: "Day Care Rollout Plan Preparation" },
      ],
    },
    {
      title: "Day Care Recruitment, Setup and Staff Readiness Completed",
      type: "Milestone",
      progressTag: "Infrastructure",
      notes: "Recruit day care staff, set up basic infrastructure, arrange equipment, and complete staff orientation before centres open.",
      startSlaDays: 105,
      slaDays: 135,
      checklist: [
        { text: "Staff identified", activityTitle: "Day Care Staff Identification" },
        { text: "Basic infrastructure ready", activityTitle: "Day Care Infrastructure Setup" },
        { text: "Equipment arranged", activityTitle: "Day Care Equipment Arrangement" },
        { text: "Staff oriented", activityTitle: "Day Care Staff Orientation", completionType: "Voice" },
      ],
    },
    {
      title: "Day Care Centres Operational in Selected Clusters",
      type: "Milestone",
      progressTag: "Live",
      notes: "Launch day care centres in selected clusters. Confirm attendance tracking, activity calendars, and monitoring are all active from Day 1.",
      startSlaDays: 120,
      slaDays: 150,
      checklist: [
        { text: "Centres launched", activityTitle: "Day Care Centre Launch" },
        { text: "Attendance started", activityTitle: "Day Care Attendance Tracking Start" },
        { text: "Activity calendar active", activityTitle: "Day Care Activity Calendar Activation" },
        { text: "Monitoring started", activityTitle: "Day Care Monitoring Start" },
      ],
    },
    {
      title: "Elder Forums Model, Training Materials and Launch Plan in Place",
      type: "Milestone",
      progressTag: "Training",
      notes: "Finalise the elder forum model, prepare training materials, and have a member mobilisation plan ready before the first forums are formed.",
      startSlaDays: 100,
      slaDays: 130,
      checklist: [
        { text: "Forum model finalized", activityTitle: "Elder Forum Model Finalisation" },
        { text: "Training materials ready", activityTitle: "Forum Training Materials Preparation" },
        { text: "Member mobilisation plan ready", activityTitle: "Forum Member Mobilisation Plan" },
      ],
    },
    {
      title: "First Set of Elder Forums Established Across Clusters",
      type: "Meeting",
      progressTag: "Live",
      notes: "Form initial elder forums across clusters, identify facilitators, and establish a regular meeting rhythm.",
      startSlaDays: 120,
      slaDays: 150,
      checklist: [
        { text: "Initial forums formed", activityTitle: "Elder Forum Formation Meeting", completionType: "Voice" },
        { text: "Facilitators identified", activityTitle: "Forum Facilitator Identification" },
        { text: "Meeting rhythm started", activityTitle: "Forum Meeting Rhythm Setup" },
      ],
    },
    {
      title: "Elderly Parliament and Friends of Elders Structures Initiated",
      type: "Meeting",
      progressTag: "Live",
      notes: "Introduce the elderly parliament model, form initial groups, and initiate volunteer support structures.",
      startSlaDays: 140,
      slaDays: 180,
      checklist: [
        { text: "Parliament model introduced", activityTitle: "Elderly Parliament Kickoff" },
        { text: "Initial groups formed", activityTitle: "Elderly Parliament Group Formation" },
        { text: "Volunteer support initiated", activityTitle: "Friends of Elders Volunteer Setup" },
      ],
    },
    {
      title: "Manuals, Advanced SOPs and Practice Notes Strengthened",
      type: "Milestone",
      progressTag: "Infrastructure",
      notes: "Update day care and community care manuals, document referral protocols, and issue practice notes based on field learnings.",
      startSlaDays: 120,
      slaDays: 160,
      checklist: [
        { text: "Day care manual updated", activityTitle: "Day Care Manual Update" },
        { text: "Community care SOP updated", activityTitle: "Community Care SOP Update" },
        { text: "Referral protocols documented", activityTitle: "Referral Protocol Documentation" },
        { text: "Practice notes issued", activityTitle: "Practice Notes Issuance" },
      ],
    },
    monthlyReview,
    {
      title: "Minimum Service Standards Functional Across All Clusters",
      type: "Review",
      progressTag: "Monitoring",
      notes: "Verify that minimum service standards are consistently met across all clusters: assessments complete, home visits active, referral systems functioning, forums started, and MIS reporting live.",
      startSlaDays: 150,
      slaDays: 180,
      checklist: [
        { text: "Assessments completed", activityTitle: "Final Assessment Completion Verification" },
        { text: "Home visits active", activityTitle: "Active Home Visit Verification" },
        { text: "Referral systems active", activityTitle: "Active Referral System Verification" },
        { text: "Forums started", activityTitle: "Elder Forum Start Verification" },
        { text: "MIS reporting active in all clusters", activityTitle: "Active MIS Reporting Verification" },
      ],
    },
  ];
}

// ── Water ATM / RO Plant Template ────────────────────────────────────────────

function buildWaterATMTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const n = Number(params.plants) || 1;
  const hh = Number(params.households) || 250;
  const track = String(params.track || "new");

  // Capacity guidance based on household count
  const capacityGuide =
    hh <= 150 ? "250–500 LPH" :
    hh <= 300 ? "500–1,000 LPH" :
    hh <= 600 ? "1,000–2,000 LPH" :
    hh <= 1200 ? "2,000–4,000 LPH" : "4,000+ LPH (consider hub-and-spoke)";

  const monitoring: PitstopTemplate = {
    title: "Monitoring & Operations",
    type: "Review",
    recurrence: "Monthly",
    notes: `Monthly monitoring of ${n} Water ATM plant(s) serving ~${hh} households. RP conducts monthly plant visit and regular dashboard reviews to catch quality decline, revenue leakage, or maintenance failures early. Plant is a standing agenda item in the monthly cluster meeting.`,
    startSlaDays: track === "new" ? 50 : 0,
    slaDays: track === "new" ? 80 : 30,
    checklist: [
      { text: "Product TDS checked and logged (target: 100–200 mg/L)", activityTitle: "Product TDS Check & Log" },
      { text: "pH and turbidity checked; monthly microbial (E. coli) lab test done", activityTitle: "Water Quality & Microbial Test", completionType: "Upload" },
      { text: "Daily litres dispensed vs. expected volume reconciled", activityTitle: "Daily Volume Reconciliation" },
      { text: "Revenue vs. flow meter logs cross-checked (divergence = theft or metering fault)", activityTitle: "Revenue vs Flow Meter Audit" },
      { text: "Card recharge frequency per household reviewed (no recharge in 2 weeks = follow up)", activityTitle: "Household Recharge Usage Review" },
      { text: "Membrane flux monitored — >15% drop in permeate flow triggers chemical clean or replacement", activityTitle: "Membrane Flux Check" },
      { text: "Pre-filter cartridge replacement checked (every 1–3 months in turbid borewell water)", activityTitle: "Pre-Filter Cartridge Check" },
      { text: "UV lamp hours tracked (replace annually at ~8,000 hours)", activityTitle: "UV Lamp Hours Review" },
      { text: "Borewell yield and water level logged (Bangalore: aquifers depleting — check quarterly)", activityTitle: "Borewell Yield & Level Log" },
      { text: "Backwash cycle log reviewed — missing cycles indicate control panel fault", activityTitle: "Backwash Cycle Log Review" },
      { text: "Downtime log reviewed (target: >95% uptime; MTTR <4 hours minor, <24 hours major)", activityTitle: "Plant Downtime Log Review" },
      { text: "Antiscalant and consumable stock checked — maintain 1–2 months buffer", activityTitle: "Consumable Stock Check" },
      { text: "RP reviews operational dashboard — TDS trend, litres dispensed, downtime, revenue", activityTitle: "Operational Dashboard Review" },
      { text: "RP monthly visit to plant — reviews all metrics with operator", activityTitle: "Monthly Plant Monitoring Visit", completionType: "Voice" },
      { text: "Water ATM reviewed as agenda item in monthly cluster meeting", activityTitle: "Water ATM Cluster Meeting Item" },
    ],
  };

  if (track === "existing") {
    return [monitoring];
  }

  return [
    {
      title: "Source Water Assessment & Site Selection",
      type: "Research",
      notes: `The most critical first step — everything depends on source water quality and site viability. RP leads the feasibility assessment: land permission, borewell approval, regulatory clearances, and site suitability. No capital is committed before RP confirms the site.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        { text: "Collect water sample from proposed borewell or source and send to certified lab", activityTitle: "Water Sample Collection & Dispatch" },
        { text: "Analyse for: TDS, pH, hardness, fluoride, nitrate, iron, arsenic, turbidity, E. coli, chloride", activityTitle: "Water Quality Lab Analysis Review", completionType: "Upload" },
        { text: "Confirm TDS >500 mg/L (NGT prohibits RO on municipal water below this — document result)", activityTitle: "TDS Compliance Verification" },
        { text: "RP conducts feasibility assessment: land permission, borewell permission, regulatory viability", activityTitle: "Site Feasibility Assessment Visit", completionType: "Voice" },
        { text: "RP applies for / follows up on CGWB or state ground water board borewell approval", activityTitle: "CGWB Borewell Approval Follow-up" },
        { text: "RP follows up on SPCB Consent to Establish and municipal body NoC", activityTitle: "SPCB & Municipal NoC Follow-up" },
        { text: "Identify plant site: minimum 15×12 ft, clean, ventilated, flood-safe, not near drains or toilets", activityTitle: "Plant Site Identification" },
        { text: "Confirm site is within 200 metres walking distance of all target households", activityTitle: "Site Proximity Verification" },
        { text: "Secure land tenure: formal lease, MoU, or NoC from landowner / civic body", activityTitle: "Land Tenure Documentation" },
        { text: "Confirm commercial electrical connection available (or plan solar/UPS backup)", activityTitle: "Electrical Connection Confirmation" },
        { text: "Plan reject water (brine) disposal: municipal drain, toilet flushing, or horticulture — never back into source aquifer", activityTitle: "Reject Water Disposal Planning" },
        { text: "RP reviews water test results and confirms site before any procurement begins", activityTitle: "Water Test Review & Site Sign-off" },
      ],
    },
    {
      title: "Demand Estimation & Plant Sizing",
      type: "Research",
      notes: `Size the plant correctly before procurement. An underpowered plant kills adoption; an overpowered one wastes capital. Target: ${hh} households → recommended capacity: ${capacityGuide}. RP reviews and approves specs.`,
      startSlaDays: 14,
      slaDays: 21,
      checklist: [
        { text: `Confirm target household count: ${hh} HH`, activityTitle: "Household Target Confirmation" },
        { text: "Estimate daily demand: 15–20 litres per household per day (drinking + cooking)", activityTitle: "Daily Demand Estimation" },
        { text: "Apply adoption rate buffer: design for 60–70% adoption initially", activityTitle: "Adoption Rate Buffer Calculation" },
        { text: "Apply peak season buffer: add 30–40% for summer months (April–June)", activityTitle: "Peak Season Capacity Planning" },
        { text: `Select plant capacity: ${capacityGuide} based on ${hh} HH`, activityTitle: "Plant Capacity Selection" },
        { text: "Account for recovery ratio (50–65%): raw water feed must be 1.5–2× product output", activityTitle: "Recovery Ratio Calculation" },
        { text: "Get at least 2 vendor quotes — confirm capex includes tanks, pipework, ATM kiosk, electrical, civil", activityTitle: "Vendor Quote Collection" },
        { text: "Plan reject water volume and confirm disposal route can handle it", activityTitle: "Reject Water Volume Planning" },
        { text: "RP reviews demand estimate and approves plant specifications before procurement", activityTitle: "Plant Specification Approval" },
      ],
    },
    {
      title: "Procurement & Installation",
      type: "Budgeting",
      notes: `Procure and install all plant components. Antiscalant dosing is mandatory for Bangalore's high-silica borewell water — skipping it is the most common cause of premature membrane failure. RP inspects the completed setup before commissioning.`,
      startSlaDays: 21,
      slaDays: 45,
      checklist: [
        { text: "Procure raw water storage tank (5,000–10,000L overhead or underground)", activityTitle: "Raw Water Tank Procurement" },
        { text: "Procure pre-filtration train: pressure sand filter → activated carbon filter → micron cartridge (5–10 micron)", activityTitle: "Pre-Filtration Train Procurement" },
        { text: "Procure antiscalant dosing pump (mandatory for Bangalore high-silica/high-hardness borewell water)", activityTitle: "Antiscalant Dosing Pump Procurement" },
        { text: "Procure high-pressure pump sized for source TDS", activityTitle: "High-Pressure Pump Procurement" },
        { text: "Procure RO membrane array and pressure vessels", activityTitle: "RO Membrane Array Procurement" },
        { text: "Procure UV steriliser (post-RO) and TDS controller/mineral dosing unit", activityTitle: "UV Steriliser & TDS Unit Procurement" },
        { text: "Procure product water storage tank (1,000–5,000L food-grade HDPE or stainless steel)", activityTitle: "Product Water Tank Procurement" },
        { text: "Procure Water ATM kiosk unit with RFID reader, payment interface, and flow meter", activityTitle: "Water ATM Kiosk Procurement" },
        { text: "Set up control panel with automated backwash timer (every 6 hours) and GSM/SIM monitoring", activityTitle: "Control Panel & GSM Setup" },
        { text: "Complete civil work: plant room, pipework, electrical connection", activityTitle: "Civil Work & Electrical Completion" },
        { text: "Complete full installation and test all components end-to-end", activityTitle: "Full Installation & End-to-End Test" },
        { text: "RP inspects completed installation before commissioning", activityTitle: "Installation Inspection Visit" },
      ],
    },
    {
      title: "Community Engagement & Payment Setup",
      type: "Meeting",
      notes: `Run parallel to installation. Household registration, RFID card distribution, operator recruitment, and health awareness. Women's SHGs are the most effective adoption channel — their buy-in determines whether households switch from free (contaminated) sources to the ATM.`,
      startSlaDays: 21,
      slaDays: 40,
      checklist: [
        { text: "Register all target households and issue RFID smart cards", activityTitle: "Household Registration & Card Issuance" },
        { text: "Load ₹20–30 trial credit on each card to break first-use barrier", activityTitle: "Trial Credit Loading on Cards" },
        { text: "Set up payment system: RFID cards primary + UPI/GPay secondary", activityTitle: "Payment System Setup" },
        { text: "Recruit plant operator from community (preference: woman from SHG)", activityTitle: "Plant Operator Recruitment" },
        { text: "Train operator: daily startup/shutdown, register maintenance, card recharges, basic troubleshooting", activityTitle: "Plant Operator Training", completionType: "Voice" },
        { text: "Engage women's SHGs — brief them on water quality and plant model; get their active endorsement", activityTitle: "SHG Briefing & Endorsement" },
        { text: "Conduct health linkage awareness sessions: water quality, disease connection, why RO matters", activityTitle: "Water Safety Awareness Sessions" },
        { text: "Conduct nukkad natak or community meeting on water safety and launch", activityTitle: "Community Launch Meeting / Nukkad Natak", completionType: "Voice" },
        { text: "Set and communicate pricing: per-litre rate that covers operating costs (reference: ₹4 per 20L)", activityTitle: "Pricing Communication to Community" },
        { text: "RP attends key SHG meeting to support community trust and address concerns", activityTitle: "SHG Engagement Meeting" },
      ],
    },
    {
      title: "Compliance, Testing & Launch",
      type: "SiteVisit",
      notes: `Launch the plant and ATM. RP makes frequent visits during the first few weeks — early adoption, teething issues with equipment, and community hesitation all need hands-on support. Compliance documentation must be in order before water is sold.`,
      startSlaDays: 45,
      slaDays: 50,
      checklist: [
        { text: "Apply for FSSAI registration or licence (mandatory before commercial water supply)", activityTitle: "FSSAI Registration Application" },
        { text: "Conduct post-installation water quality test: TDS 100–200 mg/L, pH 6.5–8.5, zero E. coli", activityTitle: "Post-Installation Water Quality Test", completionType: "Upload" },
        { text: "Document source TDS test result on file (NGT compliance record)", activityTitle: "NGT Compliance Documentation" },
        { text: "Confirm reject water disposal route is functional and not re-entering source aquifer", activityTitle: "Reject Water Disposal Verification" },
        { text: "Confirm ATM kiosk is placed at a high-visibility community node (near temple, school, main lane)", activityTitle: "ATM Kiosk Placement Verification" },
        { text: "Activate plant and ATM — confirm RFID cards, payment system, and flow meter are working", activityTitle: "Plant & ATM Activation" },
        { text: "Communicate launch date to all registered households", activityTitle: "Launch Date Communication" },
        { text: "RP present at launch day", activityTitle: "Water ATM Launch & Community Rollout" },
        { text: "RP makes frequent site visits during first 2–3 weeks: adoption check, equipment issues, community hesitation", activityTitle: "Early Adoption Site Visits", completionType: "Voice" },
        { text: "RP reviews first-week dispensed volume and household adoption rate", activityTitle: "First Week Adoption Review" },
      ],
    },
    monitoring,
  ];
}

// ── Elderly Community Kitchen Template ───────────────────────────────────────

function buildElderlyKitchenTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const n = Number(params.kitchens) || 1;
  const track = String(params.track || "new");

  const monitoring: PitstopTemplate = {
    title: "Monitoring & Tracking",
    type: "Review",
    recurrence: "Monthly",
    notes: `Monthly monitoring of all ${n} community kitchen(s). CO visits daily; RP visits all kitchens in the cluster monthly. Covers food quality, inventory, beneficiary coverage, vendor management, and substitute arrangements. Elderly kitchens are also a standing agenda item in the monthly cluster meeting.`,
    startSlaDays: track === "new" ? 35 : 0,
    slaDays: track === "new" ? 65 : 30,
    checklist: [
      { text: "CO daily visit log reviewed for all kitchens", activityTitle: "CO Daily Visit Log Review" },
      { text: "Random food quality check conducted (taste, quantity, hygiene)", activityTitle: "Random Food Quality Check" },
      { text: "Feedback collected from enrolled elderly on food quality and satisfaction", activityTitle: "Elderly Satisfaction Feedback" },
      { text: "Verify all enrolled elderly are receiving elderly pension", activityTitle: "Elderly Pension Verification" },
      { text: "Identify elderly with additional needs and refer to elderly programme team", activityTitle: "Additional Needs Identification & Referral" },
      { text: "Inventory register checked — stock matched against usage", activityTitle: "Kitchen Inventory Register Audit" },
      { text: "Vegetable vendor delivery and quality verified (3-day cycle)", activityTitle: "Vegetable Delivery Quality Check" },
      { text: "Check for leakage — overpayment, diversion, or missing stock", activityTitle: "Leakage & Diversion Check" },
      { text: "Vendor performance reviewed; escalate or change vendor if needed", activityTitle: "Vendor Performance Review" },
      { text: "Substitute kitchen arrangement confirmed for when kitchen woman is on leave", activityTitle: "Substitute Kitchen Arrangement Check" },
      { text: "RP monthly visit to all kitchens in cluster completed", activityTitle: "Monthly Kitchen Round Visit", completionType: "Voice" },
      { text: "Elderly kitchens reviewed as agenda item in monthly cluster meeting", activityTitle: "Elderly Kitchen Cluster Meeting Item" },
    ],
  };

  if (track === "existing") {
    return [monitoring];
  }

  return [
    {
      title: "Kitchen Identification",
      type: "Research",
      notes: `Identify ${n} kitchen woman/women from the community. Each kitchen serves 15 elderly for lunch daily (counts for lunch and dinner). The kitchen woman must stay home, cook reliably every day, and be trusted by the community. She is paid ₹3,000/month. CO shortlists candidates; RP visits to confirm final selection.`,
      startSlaDays: 0,
      slaDays: 15,
      checklist: [
        { text: "Confirm number of kitchens needed based on needs assessment data for this settlement", activityTitle: "Kitchen Count Confirmation" },
        { text: "CO identifies eligible women in community (stays home, cooks regularly, trusted)", activityTitle: "Eligible Kitchen Woman Identification" },
        { text: "Verify each candidate: cooks daily at home, not employed outside, physically capable", activityTitle: "Kitchen Candidate Eligibility Verification" },
        { text: "Verify community standing and trust for each candidate", activityTitle: "Community Trust Verification" },
        { text: "CO prepares shortlist and presents to RP", activityTitle: "Kitchen Candidate Shortlist Review" },
        { text: "RP visits to confirm final selection for each kitchen", activityTitle: "Kitchen Candidate Confirmation Visit" },
        { text: "Formalise understanding with selected kitchen women (role, stipend, daily expectations)", activityTitle: "Kitchen Woman Role Agreement" },
        { text: "Document kitchen locations and addresses", activityTitle: "Kitchen Location Documentation" },
      ],
    },
    {
      title: "Procurement Setup",
      type: "Budgeting",
      notes: `Set up all supply chains and infrastructure for ${n} kitchen(s). Grocery is procured monthly and stored at the resource centre; CO rations stock to each kitchen. Vegetables are procured every 3 days by the CO from a vetted vendor — payment is handled by partner accounts, not the CO. Kitchen equipment is provided only where something is missing.`,
      startSlaDays: 15,
      slaDays: 20,
      checklist: [
        { text: "Identify and vet monthly grocery vendor (rice, dal, oil, jaggery, eggs, ragi)", activityTitle: "Monthly Grocery Vendor Vetting" },
        { text: "Identify and vet vegetable vendor for 3-day cycle supply", activityTitle: "Vegetable Vendor Vetting" },
        { text: "Confirm vegetable vendor payment process with partner accounts team (not through CO)", activityTitle: "Vegetable Vendor Payment Setup" },
        { text: "Set up gas connection for each kitchen (or verify existing connection is functional)", activityTitle: "Kitchen Gas Connection Setup" },
        { text: "Assess and procure missing kitchen equipment: stove, vessels, plates", activityTitle: "Kitchen Equipment Procurement" },
        { text: "Procure lunchboxes for home delivery to bed-ridden elderly", activityTitle: "Home Delivery Lunchbox Procurement" },
        { text: "Set up storage space in resource centre for monthly grocery stock", activityTitle: "Resource Centre Storage Setup" },
        { text: "Set up inventory register and usage tracker for each kitchen (pen and paper)", activityTitle: "Kitchen Inventory Register Setup" },
        { text: "Place first month grocery order and confirm delivery schedule", activityTitle: "First Month Grocery Order" },
        { text: "RP visits to confirm procurement setup is complete", activityTitle: "Procurement Setup Confirmation Visit" },
      ],
    },
    {
      title: "Training",
      type: "Training",
      notes: `RP conducts cluster-level training for all COs covering hygiene, inventory management, menu, and delivery procedures. COs then deliver this training to kitchen women. Menu is fixed: rice + one vegetable side dish + ragi mudde + one boiled egg per person, served at lunch.`,
      startSlaDays: 20,
      slaDays: 30,
      checklist: [
        { text: "RP conducts cluster-level training for all COs (hygiene, inventory management, menu)", activityTitle: "CO Kitchen Operations Training", completionType: "Voice" },
        { text: "CO trains kitchen woman on food hygiene: handwashing, storage, utensil cleaning", activityTitle: "Kitchen Hygiene Training", completionType: "Voice" },
        { text: "CO trains kitchen woman on the fixed menu: rice + vegetable side dish + ragi mudde + boiled egg", activityTitle: "Fixed Menu Training", completionType: "Voice" },
        { text: "CO trains kitchen woman on correct portion sizes for 15 persons", activityTitle: "Portion Size Training", completionType: "Voice" },
        { text: "CO trains kitchen woman on inventory register maintenance", activityTitle: "Inventory Register Training", completionType: "Voice" },
        { text: "CO explains vegetable delivery process (CO delivers every 3 days; kitchen woman does not procure)", activityTitle: "Vegetable Delivery Process Briefing" },
        { text: "CO demonstrates lunchbox packing and delivery procedure for bed-ridden elderly", activityTitle: "Lunchbox Delivery Training", completionType: "Voice" },
        { text: "Conduct mock cook or trial run at each kitchen", activityTitle: "Mock Cook Trial Run" },
        { text: "Kitchen woman confirms she understands escalation process (CO is first contact)", activityTitle: "Escalation Process Confirmation" },
      ],
    },
    {
      title: "Enrollment",
      type: "Meeting",
      notes: `CO enrolls 15 elderly per kitchen. The list is largely prepared from prior community assessment. CO visits each elderly person at home, explains the programme, and notes any special needs. Bed-ridden elderly requiring home delivery are flagged.`,
      startSlaDays: 30,
      slaDays: 32,
      checklist: [
        { text: "CO finalises list of 15 elderly per kitchen from prior assessment", activityTitle: "Elderly Enrollment List Finalisation" },
        { text: "CO visits each enrolled elderly to explain the programme", activityTitle: "Enrolled Elderly Home Visits", completionType: "Voice" },
        { text: "Explain kitchen location, timings, and how to reach", activityTitle: "Kitchen Information Communication" },
        { text: "Explain grievance redressal mechanism (contact CO directly)", activityTitle: "Grievance Process Explanation" },
        { text: "Identify any special nutritional needs based on health condition", activityTitle: "Special Nutritional Needs Assessment" },
        { text: "Flag bed-ridden elderly requiring daily home delivery and note addresses", activityTitle: "Home Delivery Needs Identification" },
        { text: "Document enrollment details for all 15 per kitchen", activityTitle: "Enrollment Documentation" },
        { text: "RP verifies enrollment — meets a sample of enrolled elderly", activityTitle: "Enrollment Verification Visit" },
      ],
    },
    {
      title: "Rollout",
      type: "Meeting",
      notes: `Start kitchen operations. CO is present for the first few days to mobilise elderly and ensure smooth running. Track wastage, collect taste feedback, and confirm home delivery to bed-ridden is working.`,
      startSlaDays: 32,
      slaDays: 35,
      checklist: [
        { text: "Kitchen starts on agreed date", activityTitle: "Kitchen Operations Start" },
        { text: "CO present on Day 1 to mobilise enrolled elderly and ensure turnout", activityTitle: "Day 1 Kitchen Launch Support" },
        { text: "CO present for first 3–5 days until operations are stable", activityTitle: "First-Week Kitchen Stabilisation" },
        { text: "Food wastage tracked and portions adjusted if needed", activityTitle: "Wastage Tracking & Portion Adjustment" },
        { text: "Taste and quality feedback collected from elderly", activityTitle: "Elderly Taste Feedback Collection" },
        { text: "Home delivery to bed-ridden elderly activated and confirmed working", activityTitle: "Home Delivery Activation" },
        { text: "First vegetable delivery received and quality verified (3-day cycle)", activityTitle: "First Vegetable Delivery Check" },
        { text: "Any issues recorded in register and escalated to RP", activityTitle: "Issue Logging & Escalation" },
        { text: "RP visits during rollout phase to observe and support", activityTitle: "Kitchen Rollout Visit" },
      ],
    },
    monitoring,
  ];
}

// ── Zonal Lead: Zone Review Cadence ───────────────────────────────────────────

function buildZoneReviewTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const n = Number(params.rpCount) || 5;
  const freq = String(params.reviewFrequency || "Monthly");
  const isMonthly = freq === "Monthly";
  const cycleDays = isMonthly ? 30 : 90;
  const recurrence = isMonthly ? "Monthly" : "Quarterly";

  return [
    {
      title: "RP Data Submissions Review",
      type: "Review",
      recurrence,
      notes: `Review all ${n} RP(s) data submissions for the ${freq.toLowerCase()} cycle. Check for completeness, timeliness, and anomalies before the zone review meeting.`,
      startSlaDays: 0,
      slaDays: cycleDays - 5,
      checklist: [
        { text: `All ${n} RP(s) have submitted ${freq.toLowerCase()} data`, activityTitle: "RP Data Submission Verification" },
        { text: "Data completeness verified for each RP", activityTitle: "RP Data Completeness Check" },
        { text: "Late submissions logged and reason noted", activityTitle: "Late Submission Log Review" },
        { text: "Key metrics compared against targets (creche coverage, beneficiary counts, activity logs)", activityTitle: "RP Metrics vs Targets Review" },
        { text: "Data quality issues flagged to individual RPs", activityTitle: "Data Quality Issue Flag" },
        { text: "Consolidated zone-level summary prepared", activityTitle: "Zone-Level Summary Preparation" },
      ],
    },
    {
      title: "Variance & Exception Report",
      type: "Review",
      recurrence,
      notes: `Identify underperformance, blockers, and red flags across the zone's ${n} RP(s). This feeds directly into the zone review meeting and any escalations.`,
      startSlaDays: cycleDays - 4,
      slaDays: cycleDays - 2,
      checklist: [
        { text: "RPs running behind target identified", activityTitle: "Behind-Target RP Identification" },
        { text: "Root causes noted for each variance (field, capacity, external)", activityTitle: "Variance Root Cause Analysis" },
        { text: "Escalation-worthy issues flagged to manager", activityTitle: "Escalation Flag to Manager" },
        { text: "Quick wins and bright spots identified", activityTitle: "Bright Spot Identification" },
        { text: "Variance report document finalised", activityTitle: "Variance Report Finalisation" },
      ],
    },
    {
      title: `${freq} Zone Review Meeting`,
      type: "Meeting",
      recurrence,
      notes: `${freq} review with all ${n} RP(s). Go through variance report, address blockers, align on next-cycle priorities. Keep to 90 minutes max; follow up async on individual cases.`,
      startSlaDays: cycleDays - 2,
      slaDays: cycleDays,
      checklist: [
        { text: `All ${n} RP(s) present (or send written update if absent)`, activityTitle: "Zone Review Meeting" },
        { text: "Variance report reviewed with group", activityTitle: "Variance Report Group Review" },
        { text: "Each RP's top blocker acknowledged and owner assigned", activityTitle: "Blocker Acknowledgement & Owner Assignment" },
        { text: "Bright spots shared for learning", activityTitle: "Bright Spot Sharing" },
        { text: "Next cycle priorities agreed", activityTitle: "Next Cycle Priority Agreement" },
        { text: "Action items with owners and due dates documented", activityTitle: "Action Item Documentation" },
        { text: "Notes circulated to all RPs within 24 hours", activityTitle: "Meeting Notes Distribution" },
      ],
    },
    ...(isMonthly
      ? [
          {
            title: "Quarterly Zone Performance Report",
            type: "Review" as const,
            recurrence: "Quarterly" as const,
            progressTag: "Monitoring",
            notes: `Quarterly synthesis across all ${n} RP(s). Trends, cumulative outcomes, capacity gaps, and zone-level recommendations to senior leadership.`,
            startSlaDays: 0,
            slaDays: 90,
            checklist: [
              { text: "3-month data compiled for all RPs", activityTitle: "3-Month Data Compilation", completionType: "Upload" },
              { text: "Trend analysis completed (month-on-month movement)", activityTitle: "Month-on-Month Trend Analysis" },
              { text: "Cumulative beneficiary and coverage numbers verified", activityTitle: "Cumulative Beneficiary Verification" },
              { text: "Capacity gaps and RP development needs documented", activityTitle: "Capacity Gap Documentation" },
              { text: "Zone-level risks and mitigation plans noted", activityTitle: "Zone Risk & Mitigation Planning" },
              { text: "Recommendations section drafted", activityTitle: "Quarterly Report Recommendations Drafting" },
              { text: "Report reviewed with manager before submission", activityTitle: "Quarterly Zone Report Review" },
              { text: "Report submitted to programme leadership", activityTitle: "Quarterly Zone Report Submission", completionType: "Upload" },
            ],
          },
        ]
      : []),
    {
      title: "Annual Zone Plan",
      type: "Review",
      notes: `Annual planning exercise for the zone. Sets coverage targets, capacity building priorities, partnership goals, and funding requirements for the next 12 months.`,
      startSlaDays: 0,
      slaDays: 30,
      checklist: [
        { text: "Previous year performance reviewed", activityTitle: "Previous Year Performance Review" },
        { text: "Coverage gaps across settlements mapped", activityTitle: "Settlement Coverage Gap Mapping" },
        { text: `Input collected from all ${n} RP(s) on ground realities`, activityTitle: "RP Ground Realities Input Collection" },
        { text: "Settlement-level targets set for each RP", activityTitle: "Settlement-Level Target Setting" },
        { text: "Capacity building needs identified and prioritised", activityTitle: "Capacity Building Needs Prioritisation" },
        { text: "Partnership and funding requirements noted", activityTitle: "Partnership & Funding Requirements Planning" },
        { text: "Draft plan shared with senior leadership", activityTitle: "Annual Plan Draft Review" },
        { text: "Final plan approved and shared with RPs", activityTitle: "Annual Plan Approval & Communication" },
      ],
    },
  ];
}

// ── Zonal Lead: Grant & Proposal Management ───────────────────────────────────

function buildGrantProposalTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const funder = String(params.funderName || "Funder").trim() || "Funder";
  const track  = String(params.track || "new");
  const isNew  = track === "new";

  const pitstops: PitstopTemplate[] = [
    {
      title: `Needs Assessment & Funder Alignment — ${funder}`,
      type: "Research",
      notes: `Establish why ${funder} is the right fit and what the proposal should address. Confirm the funder's priorities, geographic focus, and funding envelope before committing staff time to a full proposal.`,
      startSlaDays: 0,
      slaDays: 14,
      checklist: [
        { text: `Review ${funder}'s published guidelines, focus areas, and grant ceiling`, activityTitle: "Funder Guidelines Review" },
        { text: "Map our programme gaps to funder priorities", activityTitle: "Programme-Funder Priority Mapping" },
        { text: "Confirm there is no active grant agreement that would restrict new funding from this source", activityTitle: "Existing Grant Conflict Check" },
        { text: "Establish contact with programme officer (if possible)", activityTitle: "Funder Alignment Meeting" },
        { text: "Collect community-level data to quantify the need", activityTitle: "Community Need Data Collection" },
        { text: "Document alignment rationale (1-page internal note)", activityTitle: "Alignment Rationale Documentation" },
        { text: "Get internal sign-off to proceed with proposal", activityTitle: "Internal Proposal Sign-off" },
      ],
    },
    {
      title: `Concept Note / Letter of Intent — ${funder}`,
      type: "Proposal",
      progressTag: "Mobilisation",
      notes: `Submit a concise concept note or letter of intent to ${funder}. Most funders request this before inviting a full proposal. Aim for 2–3 pages.`,
      startSlaDays: 7,
      slaDays: 28,
      checklist: [
        { text: "Problem statement drafted (data-backed)", activityTitle: "Problem Statement Drafting" },
        { text: "Proposed intervention described clearly", activityTitle: "Intervention Description Writing" },
        { text: "Expected outcomes and beneficiary reach stated", activityTitle: "Outcomes & Reach Documentation" },
        { text: "Indicative budget range included", activityTitle: "Indicative Budget Preparation" },
        { text: "Organisation credentials section completed", activityTitle: "Organisation Credentials Writing" },
        { text: "Internal review done (programme lead sign-off)", activityTitle: "Internal Concept Note Review" },
        { text: `Concept note submitted to ${funder}`, activityTitle: "Concept Note Submission", completionType: "Upload" },
        { text: "Submission acknowledged / reference number obtained", activityTitle: "Submission Acknowledgement Receipt" },
      ],
    },
  ];

  if (isNew) {
    pitstops.push({
      title: `Full Proposal Development — ${funder}`,
      type: "Proposal",
      notes: `Full proposal for ${funder}. This is the most effort-intensive pitstop — budget at least 3 weeks of collaborative drafting, internal review, and revision cycles.`,
      startSlaDays: 28,
      slaDays: 70,
      checklist: [
        { text: "Invitation to submit full proposal received", activityTitle: "Full Proposal Invitation Confirmation" },
        { text: "Proposal template/guidelines downloaded and read in full", activityTitle: "Proposal Guidelines Review" },
        { text: "Proposal writing team assembled (programme, finance, M&E)", activityTitle: "Proposal Writing Kickoff Meeting" },
        { text: "Theory of change section drafted", activityTitle: "Theory of Change Drafting" },
        { text: "Implementation plan with milestones drafted", activityTitle: "Implementation Plan Drafting" },
        { text: "Monitoring and evaluation framework drafted", activityTitle: "M&E Framework Drafting" },
        { text: "Detailed budget prepared (finance lead sign-off)", activityTitle: "Detailed Budget Preparation" },
        { text: "Risk register section completed", activityTitle: "Risk Register Completion" },
        { text: "Organisational profile and legal docs updated", activityTitle: "Org Profile & Legal Doc Update" },
        { text: "First full draft reviewed internally", activityTitle: "First Draft Internal Review" },
        { text: "Revisions completed", activityTitle: "Proposal Revisions Completion" },
        { text: "Final proposal reviewed by Director / authorised signatory", activityTitle: "Final Proposal Director Review" },
        { text: `Proposal submitted to ${funder} before deadline`, activityTitle: "Proposal Submission", completionType: "Upload" },
        { text: "Submission confirmation saved", activityTitle: "Submission Confirmation Filing", completionType: "Upload" },
      ],
    });
  } else {
    pitstops.push({
      title: `Renewal / Scale-Up Proposal — ${funder}`,
      type: "Proposal",
      notes: `Renewal or scale-up proposal for ${funder}. Lead with outcome data from the previous grant period. Funders expect you to show what changed, not just what you did.`,
      startSlaDays: 14,
      slaDays: 56,
      checklist: [
        { text: "Previous grant outcomes compiled and verified (beneficiary data, story count)", activityTitle: "Previous Grant Outcomes Compilation" },
        { text: "Learning from previous period documented", activityTitle: "Previous Period Learning Documentation" },
        { text: "Proposed scale or focus shift clearly justified", activityTitle: "Scale / Focus Shift Justification" },
        { text: "Updated implementation plan drafted", activityTitle: "Updated Implementation Plan Drafting" },
        { text: "Revised budget prepared (include learnings from previous period's spend)", activityTitle: "Revised Budget Preparation" },
        { text: "M&E framework updated", activityTitle: "M&E Framework Update" },
        { text: "Internal review done", activityTitle: "Internal Renewal Proposal Review" },
        { text: `Renewal proposal submitted to ${funder}`, activityTitle: "Renewal Proposal Submission", completionType: "Upload" },
        { text: "Submission confirmation saved", activityTitle: "Submission Confirmation Filing", completionType: "Upload" },
      ],
    });
  }

  pitstops.push(
    {
      title: `Post-Submission Funder Engagement — ${funder}`,
      type: "Meeting",
      progressTag: "Mobilisation",
      notes: `Keep the relationship alive during the review period. Respond promptly to any queries. Do not go silent after submission.`,
      startSlaDays: isNew ? 70 : 56,
      slaDays: isNew ? 120 : 90,
      checklist: [
        { text: `${funder} queries responded to within 48 hours`, activityTitle: "Funder Query Response" },
        { text: "Clarification calls or site visits accommodated", activityTitle: "Funder Clarification Call" },
        { text: "Updated financials or additional documents provided if requested", activityTitle: "Additional Document Provision" },
        { text: "Internal tracking note updated with funder interactions", activityTitle: "Funder Interaction Log Update" },
        { text: "Decision timeline confirmed with programme officer", activityTitle: "Decision Timeline Confirmation" },
      ],
    },
    {
      title: `Grant Decision & Agreement Execution — ${funder}`,
      type: "Review",
      progressTag: "Mobilisation",
      notes: `Handle the grant decision — whether approval, rejection, or conditional approval. If approved, execute the grant agreement and set up internal compliance tracking.`,
      startSlaDays: isNew ? 120 : 90,
      slaDays: isNew ? 150 : 110,
      checklist: [
        { text: `Decision received from ${funder}`, activityTitle: "Grant Decision Receipt" },
        { text: "If approved: grant agreement reviewed by Director and legal", activityTitle: "Grant Agreement Legal Review", completionType: "Upload" },
        { text: "If approved: grant agreement signed and counter-signed", activityTitle: "Grant Agreement Signing", completionType: "Upload" },
        { text: "If approved: compliance and reporting schedule extracted and calendared", activityTitle: "Compliance Schedule Calendaring" },
        { text: "If approved: finance notified and project code created", activityTitle: "Finance Notification & Project Code Setup" },
        { text: "If approved: programme team briefed on deliverables and reporting timelines", activityTitle: "Programme Team Grant Briefing" },
        { text: "If rejected: debrief with funder requested", activityTitle: "Funder Rejection Debrief" },
        { text: "If rejected: lessons documented for future applications", activityTitle: "Rejection Lessons Documentation" },
      ],
    }
  );

  return pitstops;
}

// ── Zonal Lead: Partner Relationship Management ───────────────────────────────

function buildPartnerManagementTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const n     = Number(params.partnerCount) || 2;
  const track = String(params.track || "new");
  const isNew = track === "new";

  const pitstops: PitstopTemplate[] = [];

  if (isNew) {
    pitstops.push({
      title: "Partner Mapping & Due Diligence",
      type: "Research",
      notes: `Identify and vet ${n} prospective partner(s). Due diligence is non-negotiable — a bad partnership costs more than no partnership.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        { text: `Longlist of ${n * 2}+ potential partners identified`, activityTitle: "Partner Longlist Development" },
        { text: `Shortlisted to ${n} based on geographic fit, credibility, and track record`, activityTitle: "Partner Shortlisting" },
        { text: "Online presence, annual reports, and references reviewed for each", activityTitle: "Partner Background Review" },
        { text: "Informal reference checks done (2+ per partner)", activityTitle: "Partner Reference Checks" },
        { text: "Each partner's alignment with our programme approach confirmed", activityTitle: "Programme Alignment Verification" },
        { text: "Due diligence summary shared with manager", activityTitle: "Due Diligence Summary Review" },
        { text: "Approval to proceed with outreach obtained", activityTitle: "Outreach Approval Confirmation" },
      ],
    });

    pitstops.push({
      title: "Partnership Scoping & MOU Negotiation",
      type: "Meeting",
      notes: `Negotiate the terms of partnership with each new partner. Be specific about roles, deliverables, data sharing, financial accountability, and exit terms in the MOU.`,
      startSlaDays: 21,
      slaDays: 60,
      checklist: [
        { text: "Partnership scoping meeting held with each partner", activityTitle: "Partnership Scoping Meeting" },
        { text: "Roles and responsibilities clearly agreed (who does what, where)", activityTitle: "Roles & Responsibilities Agreement" },
        { text: "Deliverables and timelines agreed", activityTitle: "Deliverables & Timeline Agreement" },
        { text: "Financial accountability terms (if funds involved) negotiated", activityTitle: "Financial Accountability Negotiation" },
        { text: "Data sharing and consent protocols agreed", activityTitle: "Data Sharing Protocol Agreement" },
        { text: "MOU draft reviewed by Director and legal", activityTitle: "MOU Legal Review", completionType: "Upload" },
        { text: "MOU signed by both parties", activityTitle: "MOU Signing", completionType: "Upload" },
        { text: "Signed MOU filed and shared with finance and programme team", activityTitle: "Signed MOU Filing & Distribution", completionType: "Upload" },
      ],
    });

    pitstops.push({
      title: "Partner Onboarding & Joint Planning",
      type: "Training",
      notes: `Orient each new partner to our programme approach, tools, and quality standards. Co-create the joint implementation plan for the first quarter.`,
      startSlaDays: 60,
      slaDays: 90,
      checklist: [
        { text: "Partner team introduced to our programme framework", activityTitle: "Partner Programme Framework Introduction" },
        { text: "Data collection tools and MIS walkthrough completed", activityTitle: "Partner MIS & Tools Walkthrough", completionType: "Voice" },
        { text: "Quality standards and non-negotiables communicated", activityTitle: "Quality Standards Communication" },
        { text: "Field visit to partner's operational area completed", activityTitle: "Partner Field Visit & Onboarding", completionType: "Voice" },
        { text: "First-quarter joint work plan co-created", activityTitle: "First-Quarter Joint Work Plan" },
        { text: "Primary points of contact confirmed on both sides", activityTitle: "Points of Contact Confirmation" },
        { text: "Communication and escalation protocol agreed", activityTitle: "Communication & Escalation Protocol" },
      ],
    });
  }

  pitstops.push(
    {
      title: "Quarterly Partner Joint Review",
      type: "Meeting",
      recurrence: "Quarterly",
      notes: `Quarterly review with all ${n} partner(s). Review joint deliverables, address friction, and plan the next quarter. Be honest about what is and isn't working.`,
      startSlaDays: isNew ? 90 : 0,
      slaDays: isNew ? 90 + 90 : 90,
      checklist: [
        { text: `All ${n} partner(s) present at review`, activityTitle: "Quarterly Partner Joint Review" },
        { text: "Previous quarter deliverables reviewed against plan", activityTitle: "Previous Quarter Deliverables Review" },
        { text: "Data quality and reporting timeliness discussed", activityTitle: "Partner Data Quality Discussion" },
        { text: "Financial utilisation reviewed (if funds are involved)", activityTitle: "Partner Financial Utilisation Review" },
        { text: "Friction points surfaced and resolved or escalated", activityTitle: "Friction Points Resolution" },
        { text: "Next quarter joint plan confirmed", activityTitle: "Next Quarter Joint Plan Confirmation" },
        { text: "Minutes documented and shared within 5 days", activityTitle: "Partner Review Minutes Distribution" },
      ],
    },
    {
      title: "Partner Deliverable & Reporting Audit",
      type: "Review",
      recurrence: "Quarterly",
      notes: `Quality audit of what partners have actually delivered vs. committed. Don't conflate activity (meetings held, visits done) with outcome (children enrolled, cases resolved).`,
      startSlaDays: isNew ? 90 : 0,
      slaDays: isNew ? 90 + 85 : 85,
      checklist: [
        { text: `Deliverable log updated for all ${n} partner(s)`, activityTitle: "Partner Deliverable Log Update" },
        { text: "Commitments vs. actuals documented", activityTitle: "Commitments vs Actuals Documentation" },
        { text: "Evidence of key deliverables collected (reports, photos, beneficiary data)", activityTitle: "Deliverable Evidence Collection" },
        { text: "Variance between committed and delivered noted with explanation", activityTitle: "Deliverable Variance Analysis" },
        { text: "Financial utilisation vs. milestones verified", activityTitle: "Financial Utilisation Verification" },
        { text: "Corrective actions agreed where needed", activityTitle: "Corrective Action Agreement" },
        { text: "Audit summary shared with manager", activityTitle: "Deliverable Audit Summary Review" },
      ],
    },
    {
      title: "Annual Partnership Health Review",
      type: "Review",
      notes: `Annual 360° review of each partnership. Is it working? Is the partner delivering? Is the relationship healthy? This informs renewal, scale-up, or exit decisions.`,
      startSlaDays: isNew ? 335 : 335,
      slaDays: isNew ? 365 : 365,
      checklist: [
        { text: `Annual outcome data compiled for all ${n} partner(s)`, activityTitle: "Annual Partner Outcome Data Compilation", completionType: "Upload" },
        { text: "Health check conversation held with each partner (frank, two-way)", activityTitle: "Annual Partnership Health Review" },
        { text: "Partner satisfaction with the relationship assessed", activityTitle: "Partner Satisfaction Assessment" },
        { text: "Our satisfaction with the partner's delivery assessed", activityTitle: "Our Delivery Satisfaction Assessment" },
        { text: "Renewal, scale-up, or exit recommendation drafted per partner", activityTitle: "Renewal / Exit Recommendation Drafting" },
        { text: "Recommendation shared with Director", activityTitle: "Partnership Recommendation Director Review" },
        { text: "Decision communicated to partner with adequate notice", activityTitle: "Partnership Decision Communication" },
      ],
    }
  );

  return pitstops;
}

// ── Zonal Lead: Capacity Building Plan ────────────────────────────────────────

function buildCapacityBuildingTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const n     = Number(params.rpCount) || 5;
  const focus = String(params.focus || "all");

  const focusLabel: Record<string, string> = {
    field:     "Field Skills & Community Practice",
    data:      "Data Management & MIS",
    facilitation: "Community Facilitation & Group Work",
    all:       "All Domains",
  };
  const label = focusLabel[focus] ?? "All Domains";

  const gapChecklist: Record<string, { text: string; activityTitle?: string }[]> = {
    field: [
      { text: "Field observation conducted with each RP (half-day shadow)", activityTitle: "RP Field Observation (TNA)" },
      { text: "Programme adherence rated per RP (0–10 checklist)", activityTitle: "Programme Adherence Rating" },
      { text: "Common field-skill gaps ranked by frequency", activityTitle: "Field-Skill Gap Ranking" },
      { text: "Individual RP development plan drafted", activityTitle: "Individual RP Development Plan Drafting" },
      { text: "Structural/resource gaps (not individual) separated out", activityTitle: "Structural Gap Identification" },
    ],
    data: [
      { text: "MIS submission timeliness reviewed for each RP", activityTitle: "MIS Submission Timeliness Review" },
      { text: "Data accuracy spot-checked (10% of records per RP)", activityTitle: "Data Accuracy Spot-Check" },
      { text: "Common data errors catalogued", activityTitle: "Common Data Error Cataloguing" },
      { text: "RPs who need one-on-one MIS coaching identified", activityTitle: "MIS Coaching Needs Identification" },
      { text: "Structural tool issues escalated to MIS team", activityTitle: "Structural Tool Issue Escalation" },
    ],
    facilitation: [
      { text: "Community group meeting quality observed for each RP", activityTitle: "Facilitation Quality Observation" },
      { text: "Facilitation skill rated per RP against standard rubric", activityTitle: "Facilitation Skill Rating" },
      { text: "Gaps in group formation, conflict handling, and participation noted", activityTitle: "Facilitation Gap Analysis" },
      { text: "Best-practice RPs identified for peer learning", activityTitle: "Best-Practice RP Identification" },
    ],
    all: [
      { text: "Field observation conducted with each RP (half-day shadow)", activityTitle: "RP Field Observation (TNA)" },
      { text: "MIS submission timeliness and accuracy reviewed", activityTitle: "MIS Submission Review" },
      { text: "Community facilitation quality observed", activityTitle: "Community Facilitation Observation" },
      { text: `All ${n} RP individual skill profiles completed`, activityTitle: "RP Skill Profile Completion" },
      { text: "Top 3 priority development areas identified per RP", activityTitle: "Priority Development Area Identification" },
      { text: "Zone-wide patterns (vs. individual gaps) noted for structural fix", activityTitle: "Zone-Wide Pattern Analysis" },
    ],
  };

  const deliveryChecklist: Record<string, { text: string; activityTitle?: string; completionType?: string }[]> = {
    field: [
      { text: "Training session facilitated (field protocols, safety, documentation)", activityTitle: "Field Skills Training Session", completionType: "Voice" },
      { text: "Role-play / field simulation included", activityTitle: "Field Simulation Exercise" },
      { text: `All ${n} RP(s) attended or received make-up session`, activityTitle: "RP Training Attendance Confirmation", completionType: "Voice" },
      { text: "Field practice assignment given (to be reviewed next cycle)", activityTitle: "Field Practice Assignment" },
      { text: "Attendance and feedback form completed", activityTitle: "Training Feedback Collection", completionType: "Voice" },
    ],
    data: [
      { text: "MIS hands-on lab session conducted (not just slides)", activityTitle: "MIS Hands-On Lab Session" },
      { text: "Common errors walked through with real examples", activityTitle: "MIS Error Walkthrough", completionType: "Voice" },
      { text: `All ${n} RP(s) completed the practice submission`, activityTitle: "Practice Submission Completion Check" },
      { text: "One-on-one coaching done with the 2 weakest RPs", activityTitle: "One-on-One MIS Coaching" },
      { text: "Quick-reference data entry guide distributed", activityTitle: "Data Entry Quick Guide Distribution" },
    ],
    facilitation: [
      { text: "Facilitation skills workshop conducted (participatory format)", activityTitle: "Facilitation Skills Workshop" },
      { text: "Peer learning pairs set up (strong RP coaches weaker RP)", activityTitle: "Peer Learning Pair Setup" },
      { text: `All ${n} RP(s) completed one observed practice facilitation`, activityTitle: "Observed Practice Facilitation" },
      { text: "Feedback given to each RP within 48 hours", activityTitle: "Post-Practice RP Feedback" },
    ],
    all: [
      { text: "Full-day capacity building session delivered", activityTitle: "Quarterly Capacity Building Session" },
      { text: "Field skills module completed", activityTitle: "Field Skills Module Completion" },
      { text: "Data and MIS module completed", activityTitle: "Data & MIS Module Completion" },
      { text: "Community facilitation module completed", activityTitle: "Facilitation Module Completion" },
      { text: `All ${n} RP(s) attended all sessions`, activityTitle: "Full Session Attendance Verification" },
      { text: "Pre/post knowledge assessment administered", activityTitle: "Pre/Post Knowledge Assessment" },
      { text: "Individual feedback given to each RP", activityTitle: "Individual RP Feedback Session" },
      { text: "Resource pack (tools, guides) distributed", activityTitle: "Resource Pack Distribution" },
    ],
  };

  const impactChecklist = [
    { text: "Field performance re-rated using same rubric as gap assessment", activityTitle: "Field Performance Re-Rating" },
    { text: "MIS accuracy re-checked (10% sample per RP)", activityTitle: "MIS Accuracy Re-Check" },
    { text: "Improvement vs. baseline documented per RP", activityTitle: "Skill Improvement Documentation" },
    { text: "Persistent gaps identified — does the RP need deeper support or is this structural?", activityTitle: "Persistent Gap Identification" },
    { text: "Next cycle priorities adjusted based on findings", activityTitle: "Next Cycle Priority Adjustment" },
    { text: "Top-performing RPs flagged for peer mentor or senior RP role", activityTitle: "Top RP Recognition & Role Flag" },
    { text: "Impact summary shared with programme leadership", activityTitle: "Capacity Impact Summary Submission", completionType: "Upload" },
  ];

  return [
    {
      title: "Training Needs Assessment",
      type: "Research",
      notes: `Baseline assessment of all ${n} RP(s) in ${label}. Do not design training without this — generic training wastes everyone's time.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        ...(gapChecklist[focus] ?? gapChecklist.all),
        { text: "Training plan for the year drafted and shared with manager", activityTitle: "Annual Training Plan Drafting" },
        { text: "Manager sign-off on training plan obtained", activityTitle: "Training Plan Manager Sign-off" },
      ],
    },
    {
      title: `Quarterly Capacity Building Session — ${label}`,
      type: "Training",
      recurrence: "Quarterly",
      notes: `Quarterly training for all ${n} RP(s) on ${label}. Rotate content each quarter based on the annual training plan. Keep sessions practical — at least 40% of time in exercises or simulation.`,
      startSlaDays: 21,
      slaDays: 90,
      checklist: deliveryChecklist[focus] ?? deliveryChecklist.all,
    },
    {
      title: "Peer Learning & Mentoring Round",
      type: "SiteVisit",
      recurrence: "Quarterly",
      notes: `Cross-RP learning visit. Pair a strong-performing RP with a struggling one for a half-day shadow in the field. More effective than classroom training for most field skills.`,
      startSlaDays: 30,
      slaDays: 90,
      checklist: [
        { text: "Peer pairs assigned (strong RP + developing RP)", activityTitle: "Peer Learning Pair Assignment" },
        { text: "Field visits scheduled and conducted", activityTitle: "Peer Learning Field Visit", completionType: "Voice" },
        { text: `All ${n} RP(s) are either host or visitor this cycle`, activityTitle: "Peer Visit Coverage Verification" },
        { text: "Post-visit debrief (30 min) held with each pair", activityTitle: "Post-Visit Pair Debrief" },
        { text: "Observations and takeaways documented", activityTitle: "Peer Learning Takeaway Documentation" },
        { text: "Next-cycle pairs adjusted based on skill movement", activityTitle: "Next Cycle Pair Adjustment" },
      ],
    },
    {
      title: "Individual RP Coaching Check-ins",
      type: "Meeting",
      recurrence: "Monthly",
      notes: `One-on-one check-in with each RP. Separate from the zone review — this is developmental, not performance review. Create safety for RPs to be honest about where they are struggling.`,
      startSlaDays: 0,
      slaDays: 30,
      checklist: [
        { text: `Check-ins scheduled and held with all ${n} RP(s) this month`, activityTitle: "RP Coaching Check-in" },
        { text: "Each RP's individual development plan reviewed", activityTitle: "Individual Development Plan Review" },
        { text: "Blocker to skill growth identified (knowledge, confidence, workload, resource)", activityTitle: "Skill Growth Blocker Identification" },
        { text: "Specific support offered (coaching, resource, escalation)", activityTitle: "RP Support Provision" },
        { text: "Next month focus area agreed with each RP", activityTitle: "Next Month Focus Area Agreement" },
        { text: "Coaching log updated", activityTitle: "Coaching Log Update" },
      ],
    },
    {
      title: "Quarterly Capacity Impact Assessment",
      type: "Review",
      recurrence: "Quarterly",
      notes: `Measure whether the training and coaching is working. Use the same rubrics from the gap assessment. If skill levels aren't moving, the training approach needs to change, not just the frequency.`,
      startSlaDays: 80,
      slaDays: 90,
      checklist: impactChecklist,
    },
  ];
}

// ── Template registry ─────────────────────────────────────────────────────────

type BuildFn = (params: Record<string, string | number>) => PitstopTemplate[];
const wrapWithTags = (fn: BuildFn): BuildFn => (p) => applyProgressTags(fn(p));

export const TEMPLATES: GoalTemplate[] = [
  {
    id: "creche-program",
    name: "Creche Program",
    description: "End-to-end setup and operations for community creches, based on our protocols. Covers recruitment, govt liaison, community engagement, caregiver training, and ongoing operations.",
    category: "Community Programs",
    icon: "🏠",
    needsDomain: "Creche",
    parameters: [
      {
        key: "track",
        label: "New creche(s) or managing existing?",
        type: "choice",
        options: [
          { value: "new", label: "Setting up new creche(s)" },
          { value: "existing", label: "Managing existing creche(s)" },
        ],
      },
      {
        key: "creches",
        label: "Number of creches",
        type: "number",
        min: 1,
        max: 1000000,
        placeholder: "e.g. 10",
      },
    ],
    build: wrapWithTags(buildCrecheTemplate),
  },
  {
    id: "welfare-rights",
    name: "Welfare Rights Programme",
    description: "Community collective formation and civic empowerment programme. Covers team setup, settlement mapping, community group formation, MAS, civic amenities baseline, stakeholder engagement, and ongoing review cadence.",
    category: "Community Programs",
    icon: "⚖️",
    parameters: [
      {
        key: "clusters",
        label: "Number of clusters",
        type: "number",
        min: 1,
        max: 1000000,
        placeholder: "e.g. 2 (each ~5,000 HH, 6-8 settlements)",
      },
    ],
    build: wrapWithTags(buildWelfareRightsTemplate),
  },
  {
    id: "children-learning-centre",
    name: "Children Learning Centre",
    description: "Setup and operations for Children Learning Centres (CLC) serving children aged 4–14. Covers team recruitment, centre setup, children survey & baseline, staff training, daily operations, school linkage, life skills programme, and MIS.",
    category: "Community Programs",
    icon: "📚",
    needsDomain: "ChildrenCentre",
    parameters: [
      {
        key: "track",
        label: "New centre(s) or managing existing?",
        type: "choice",
        options: [
          { value: "new", label: "Setting up new centre(s)" },
          { value: "existing", label: "Managing existing centre(s)" },
        ],
      },
      {
        key: "centres",
        label: "Number of centres",
        type: "number",
        min: 1,
        max: 1000000,
        placeholder: "e.g. 2 (each serving ~100 children)",
      },
    ],
    build: wrapWithTags(buildChildrenTemplate),
  },
  {
    id: "youth-resource-centre",
    name: "Youth Resource Centre",
    description: "Setup and operations for Youth Resource Centres (YRC) serving youth aged 15–21. Covers team recruitment, YRC setup, enumeration & baseline, group mobilisation, capacity building, scheme linkage, leadership programme, social actions, and crisis support.",
    category: "Community Programs",
    icon: "🌱",
    needsDomain: "YouthResourceCentre",
    parameters: [
      {
        key: "track",
        label: "New YRC or managing existing?",
        type: "choice",
        options: [
          { value: "new", label: "Setting up new Youth Resource Centre(s)" },
          { value: "existing", label: "Managing existing YRC(s)" },
        ],
      },
      {
        key: "clusters",
        label: "Number of clusters / YRCs",
        type: "number",
        min: 1,
        max: 1000000,
        placeholder: "e.g. 2 (1 YRC per cluster)",
      },
    ],
    build: wrapWithTags(buildYouthTemplate),
  },
  {
    id: "water-atm",
    name: "Water ATM / RO Plant",
    description: "Setup and ongoing operations of a community RO water plant with ATM kiosk. Covers source water assessment, RP-led feasibility and regulatory clearances, plant sizing, procurement, community engagement, compliance, launch, and monthly monitoring.",
    category: "Community Programs",
    icon: "💧",
    needsDomain: "WaterATM",
    parameters: [
      {
        key: "track",
        label: "New plant, or managing existing?",
        type: "choice",
        options: [
          { value: "new", label: "Setting up new plant and ATM" },
          { value: "existing", label: "Managing existing plant" },
        ],
      },
      {
        key: "plants",
        label: "Number of plants / ATM units",
        type: "number",
        min: 1,
        max: 100,
        placeholder: "e.g. 1",
      },
      {
        key: "households",
        label: "Households to serve",
        type: "number",
        min: 50,
        max: 10000,
        placeholder: "e.g. 250",
      },
    ],
    build: wrapWithTags(buildWaterATMTemplate),
  },
  {
    id: "elderly-kitchen",
    name: "Elderly Community Kitchen",
    description: "Setup and ongoing management of community kitchens serving elderly. Each kitchen is run by one woman serving 15 elderly daily (fixed menu: rice + vegetable side dish + ragi mudde + boiled egg). Covers identification, procurement, training, enrollment, rollout, and monthly monitoring.",
    category: "Community Programs",
    icon: "🍲",
    needsDomain: "ElderlyKitchen",
    parameters: [
      {
        key: "track",
        label: "New kitchen(s) or managing existing?",
        type: "choice",
        options: [
          { value: "new", label: "Setting up new kitchen(s)" },
          { value: "existing", label: "Managing existing kitchen(s)" },
        ],
      },
      {
        key: "kitchens",
        label: "Number of kitchens",
        type: "number",
        min: 1,
        max: 10000,
        placeholder: "e.g. 3",
      },
    ],
    build: wrapWithTags(buildElderlyKitchenTemplate),
  },
  {
    id: "elderly-centre",
    name: "Elderly Care Centre & Outreach",
    description: "Full rollout of a structured elderly care programme across clusters. Covers partner alignment, team deployment, MIS setup, baseline assessments, categorisation, home visit systems, referral pathways, day care centres, elder forums, and ongoing monitoring.",
    category: "Community Programs",
    icon: "🏥",
    needsDomain: "ElderlyCentre",
    parameters: [
      {
        key: "track",
        label: "New programme or managing existing?",
        type: "choice",
        options: [
          { value: "new", label: "Setting up new elderly care programme" },
          { value: "existing", label: "Managing existing programme" },
        ],
      },
    ],
    build: wrapWithTags(buildElderlyCentreTemplate),
  },
  {
    id: "seeding-programme",
    name: "Seeding Programme",
    description: "End-to-end programme for sourcing, screening, and seeding new organisations in the social sector. Covers team setup, geo demand estimation, peer learning, sourcing framework, capacity building approach, pipeline building, cohort placement, and review cadence.",
    category: "Programmes",
    icon: "🌱",
    parameters: [
      {
        key: "cohort",
        label: "Cohort size (individuals / orgs)",
        type: "number",
        min: 1,
        max: 1000000,
        placeholder: "e.g. 5",
      },
    ],
    build: wrapWithTags(buildSeedingTemplate),
  },
  // ── RP Templates ───────────────────────────────────────────────────────────
  {
    id: "rp-typical-cluster",
    name: "Cluster Work Plan — Typical Cluster",
    description: "Quarterly work plan for a Resource Person covering one typical cluster (~6000 households, 11 slums). Covers Welfare Rights, Children (4–14), Youth (15–21), Elderly (55+), Creches, and Admin. ~20 working days/month.",
    category: "Field Programmes",
    icon: "🏘️",
    parameters: [
      { key: "clusterName", label: "Cluster name", type: "text", placeholder: "e.g. Byatarayanapura" },
      { key: "creches", label: "Number of creches in cluster", type: "number", min: 1, max: 30, placeholder: "e.g. 11" },
    ],
    build(params) {
      const cluster = String(params.clusterName || "Cluster");
      const n = Number(params.creches) || 11;
      return [
        // WELFARE RIGHTS
        { title: `WR: Community Group Meeting — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly meeting with all community groups at cluster level. Review WR cases, escalations, and organizer progress.", checklist: [{ text: "Pre-meeting agenda circulated to partner", activityTitle: "Pre-Meeting Agenda Circulation" }, { text: "All slum community groups represented", activityTitle: "Community Group Monthly Meeting", completionType: "Voice" }, { text: "Active WR cases reviewed", activityTitle: "Active WR Cases Review" }, { text: "Issues and escalations documented", activityTitle: "Issues & Escalations Documentation" }, { text: "Follow-up action owners assigned", activityTitle: "Follow-up Action Owner Assignment" }, { text: "Meeting notes shared with partner", activityTitle: "Meeting Notes Distribution" }] },
        { title: `WR: Partner Review Meeting — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with partner team (cluster coordinator + COs). Progress on pending cases, priorities for next month.", checklist: [{ text: "Cluster coordinator and all COs present", activityTitle: "Partner Review Meeting" }, { text: "Previous month action items reviewed", activityTitle: "Previous Month Action Items Review" }, { text: "Pending WR cases status updated", activityTitle: "Pending WR Cases Update" }, { text: "MIS data cross-checked with field reality", activityTitle: "MIS vs Field Reality Cross-check" }, { text: "Next month priorities agreed", activityTitle: "Next Month Priorities Agreement" }] },
        { title: `WR: Rights Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly training on civic amenities, land & housing rights, welfare schemes. Topics rotate each month.", checklist: [{ text: "Training topic selected (civic amenities / land / housing / scheme)", activityTitle: "WR Training Topic Selection" }, { text: "Training material prepared", activityTitle: "Training Material Preparation" }, { text: "All COs and coordinator attended", activityTitle: "WR Rights Training", completionType: "Voice" }, { text: "Practice / role-play conducted", activityTitle: "Rights Training Role-Play", completionType: "Voice" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }, { text: "Follow-up material distributed", activityTitle: "Training Follow-up Material Distribution" }] },
        // CHILDREN
        { title: `Children: Centre Visit (Twice-Weekly) — ${cluster}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Visit the children's centre twice a week (½ day each). Handhold coordinator in planned activities and quality review.", checklist: [{ text: "Centre activity for the day observed", activityTitle: "Children's Centre Visit", completionType: "Voice" }, { text: "Coordinator supported on planned activity", activityTitle: "Coordinator Activity Support" }, { text: "Attendance register reviewed", activityTitle: "Attendance Register Review" }, { text: "Learning quality spot-check done", activityTitle: "Learning Quality Spot-Check" }, { text: "Infrastructure / material needs flagged", activityTitle: "Infrastructure & Material Needs Flag" }, { text: "Coordinator debrief completed", activityTitle: "Coordinator Debrief" }] },
        { title: `Children: Monthly Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly training for children's programme activities. Reinforce with coordinator post-session.", checklist: [{ text: "Training topic aligned with monthly plan", activityTitle: "Monthly Training Topic Alignment" }, { text: "Full session attended", activityTitle: "Full Training Session Attendance", completionType: "Voice" }, { text: "Key learning shared with coordinator", activityTitle: "Key Learning Coordinator Briefing" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }] },
        { title: `Children: Govt School / DI Coordination — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Visit relevant government schools and coordinate with DI on dropout follow-up and school-community engagement.", checklist: [{ text: "Target school(s) visited / DI contacted", activityTitle: "School / DI Coordination Visit", completionType: "Voice" }, { text: "Out-of-school children list updated", activityTitle: "Out-of-School Children List Update" }, { text: "Dropout follow-up done with partner", activityTitle: "Dropout Follow-up with Partner" }, { text: "School engagement plan progressed", activityTitle: "School Engagement Plan Progression" }, { text: "Next steps documented", activityTitle: "School Coordination Next Steps" }] },
        // YOUTH
        { title: `Youth: Saturday Centre Visit + CAP Review — ${cluster}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Every Saturday: visit youth resource centre and review CAP progress with youth groups (½ day/week).", checklist: [{ text: "Youth centre visited", activityTitle: "Youth Centre Visit & CAP Review", completionType: "Voice" }, { text: "Coordinator supported", activityTitle: "Youth Coordinator Support" }, { text: "Youth groups met for CAP review", activityTitle: "Youth Group CAP Review", completionType: "Voice" }, { text: "CAP milestones status updated", activityTitle: "CAP Milestone Update" }, { text: "Blockers / issues logged", activityTitle: "CAP Blockers & Issues Log" }, { text: "Wins noted for motivation", activityTitle: "Youth Wins Documentation" }] },
        { title: `Youth: Monthly Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly youth programme training. Brief coordinator on key takeaways.", checklist: [{ text: "Training topic aligned with monthly plan", activityTitle: "Monthly Training Topic Alignment" }, { text: "Full session attended", activityTitle: "Full Training Session Attendance", completionType: "Voice" }, { text: "Coordinator briefed post-training", activityTitle: "Post-Training Coordinator Briefing", completionType: "Voice" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }] },
        // ELDERLY
        { title: `Elderly: Monthly Centre and Outreach Review — ${cluster}`, type: "Review", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review of elderly care centre operations and outreach coverage.", checklist: [{ text: "Centre visited and operations observed", activityTitle: "Elderly Centre Monthly Visit", completionType: "Voice" }, { text: "Outreach coverage vs. target reviewed", activityTitle: "Outreach Coverage vs Target Review" }, { text: "Caregiver welfare checked", activityTitle: "Caregiver Welfare Check" }, { text: "Health referral cases followed up", activityTitle: "Health Referral Cases Follow-up" }, { text: "Issues escalated with action owners", activityTitle: "Issues Escalation with Owners" }] },
        { title: `Elderly: Monthly Team Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly training for full elderly care team (coordinator, helpers, outreach workers, part-time therapists).", checklist: [{ text: "Training topic prepared", activityTitle: "Training Topic Preparation", completionType: "Voice" }, { text: "All staff attended", activityTitle: "Full Staff Training Attendance", completionType: "Voice" }, { text: "Practical demonstration included", activityTitle: "Practical Demonstration" }, { text: "Action points documented", activityTitle: "Training Action Points Documentation", completionType: "Upload" }] },
        { title: `Elderly: Field Day with COs — ${cluster}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "One full day each with CO-1 and CO-2 on the field. Observe work, provide coaching. 2 days/month total.", checklist: [{ text: "Field day with CO-1 completed", activityTitle: "CO Field Day", completionType: "Voice" }, { text: "Field day with CO-2 completed", activityTitle: "CO Field Day (CO-2)", completionType: "Voice" }, { text: "Field observations documented for both", activityTitle: "CO Field Observations Documentation" }, { text: "Coaching and support provided", activityTitle: "CO Coaching & Support" }] },
        { title: `Elderly: CSO Referral Mapping — ${cluster}`, type: "Research", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Map local CSOs and govt services for elderly referrals. Establish active referral relationships.", checklist: [{ text: "CSOs / govt services identified", activityTitle: "CSO & Govt Service Identification" }, { text: "At least 2 new referral contacts established", activityTitle: "New Referral Contact Establishment" }, { text: "Referral directory updated and shared", activityTitle: "Referral Directory Update" }, { text: "At least 1 successful referral completed and documented", activityTitle: "Successful Referral Documentation" }] },
        // CRECHES
        { title: `Creche: Monthly Rounds (${n} creches) — ${cluster}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: `Monthly 2-hour visit to each of the ${n} creches in the cluster (~3 days/month).`, checklist: [{ text: `All ${n} creches visited this month`, activityTitle: "Monthly Creche Round Visit", completionType: "Voice" }, { text: "Caregiver conduct observed in each creche", activityTitle: "Caregiver Conduct Observation", completionType: "Voice" }, { text: "Child nutrition records reviewed", activityTitle: "Child Nutrition Records Review" }, { text: "Hygiene and safety standards checked", activityTitle: "Creche Hygiene & Safety Check" }, { text: "Issues flagged to supervisor immediately", activityTitle: "Issues Flag to Supervisor" }, { text: "Creche visit log updated", activityTitle: "Creche Visit Log Update" }] },
        { title: `Creche: Supervisor Review — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with creche supervisors. Quality concerns, caregiver issues, expansion pipeline.", checklist: [{ text: "Both supervisors attended", activityTitle: "Creche Supervisor Review Meeting" }, { text: "Monthly rounds findings discussed", activityTitle: "Monthly Rounds Findings Discussion", completionType: "Voice" }, { text: "Caregiver performance issues addressed", activityTitle: "Caregiver Performance Issue Resolution" }, { text: "Expansion / new creche pipeline reviewed", activityTitle: "New Creche Pipeline Review" }, { text: "Action items documented", activityTitle: "Supervisor Review Action Items" }] },
        // TEAM & ADMIN
        { title: "City / Zonal Team Review", type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly city-level or zonal RP team review. Present cluster updates and cross-learn.", checklist: [{ text: "Attended city / zonal team review", activityTitle: "City/Zonal Team Review Meeting" }, { text: "Cluster update presented", activityTitle: "Cluster Update Presentation" }, { text: "Cross-learning shared with team", activityTitle: "Cross-Learning Sharing" }, { text: "Systemic issues flagged to PM", activityTitle: "Systemic Issues Flag to PM" }, { text: "Action items noted", activityTitle: "Review Action Items Note" }] },
        { title: "Quarterly Report and Programme Review", type: "Review", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Quarterly report covering all programme domains. Data, analysis, challenges, learnings, and next quarter plan.", checklist: [{ text: "WR data compiled", activityTitle: "WR Data Compilation", completionType: "Upload" }, { text: "Children programme data compiled", activityTitle: "Children Programme Data Compilation", completionType: "Upload" }, { text: "Youth programme data compiled", activityTitle: "Youth Programme Data Compilation", completionType: "Upload" }, { text: "Elderly programme data compiled", activityTitle: "Elderly Programme Data Compilation", completionType: "Upload" }, { text: "Creche programme data compiled", activityTitle: "Creche Programme Data Compilation", completionType: "Upload" }, { text: "Partner inputs received", activityTitle: "Partner Inputs Collection" }, { text: "Challenges and learnings written", activityTitle: "Challenges & Learnings Writing" }, { text: "Next quarter priorities drafted", activityTitle: "Next Quarter Priorities Drafting" }, { text: "Report reviewed with PM", activityTitle: "Quarterly Report PM Review" }, { text: "Report submitted on time", activityTitle: "Quarterly Report Submission", completionType: "Upload" }] },
        { title: "Documentation and Desk Work", type: "Custom", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "~2 days/month for field notes, MIS updates, partner communications, and coordination.", checklist: [{ text: "Field visit notes compiled", activityTitle: "Field Visit Notes Compilation", completionType: "Upload" }, { text: "MIS / database updated", activityTitle: "MIS Database Update" }, { text: "Partner communications responded to", activityTitle: "Partner Communications Response" }, { text: "Pending escalations followed up", activityTitle: "Pending Escalation Follow-up" }, { text: "Leave and attendance recorded", activityTitle: "Leave & Attendance Recording" }] },
      ];
    },
  },
  {
    id: "rp-base-cluster",
    name: "Cluster Work Plan — Base Cluster (2–3 Clusters)",
    description: "Quarterly work plan for a Resource Person covering 2–3 base clusters. A base cluster is roughly half the activity of a typical cluster (~10 days/month per cluster). Lighter frequency and combined sessions.",
    category: "Field Programmes",
    icon: "🏚️",
    parameters: [
      { key: "clusterNames", label: "Cluster names (comma-separated)", type: "text", placeholder: "e.g. Hebbal, Bagalur" },
    ],
    build(params) {
      const clusters = String(params.clusterNames || "Base Clusters");
      return [
        { title: `WR: Combined Community & Partner Review — ${clusters}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Combined monthly meeting: community group reps + partner team together. Covers WR cases, partner progress, and issues. Run for each base cluster on rotation.", checklist: [{ text: "Community group representatives present", activityTitle: "Community & Partner Review Meeting", completionType: "Voice" }, { text: "Partner (coordinator + COs) present", activityTitle: "Partner Team Attendance" }, { text: "Active WR cases reviewed", activityTitle: "Active WR Cases Review" }, { text: "Previous month action items followed up", activityTitle: "Previous Month Action Items Follow-up" }, { text: "Next month priorities agreed", activityTitle: "Next Month Priorities Agreement" }, { text: "Notes shared with partner within 2 days", activityTitle: "Meeting Notes Distribution" }] },
        { title: `WR: Rights Training (Quarterly) — ${clusters}`, type: "Training", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Quarterly rights training for partner team. Can be run as a joint session across all base clusters in the zone.", checklist: [{ text: "Training topic selected for the quarter", activityTitle: "WR Rights Training", completionType: "Voice" }, { text: "All base cluster COs invited", activityTitle: "Base Cluster CO Training Invitation", completionType: "Voice" }, { text: "Training material prepared", activityTitle: "Training Material Preparation" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }, { text: "Follow-up material distributed", activityTitle: "Training Follow-up Material Distribution" }] },
        { title: `Children: Weekly Centre Visit — ${clusters}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Visit children's centre once a week (½ day). Rotate across clusters if covering more than one.", checklist: [{ text: "Centre activities observed", activityTitle: "Children's Centre Visit", completionType: "Voice" }, { text: "Coordinator supported", activityTitle: "Coordinator Activity Support" }, { text: "Attendance register reviewed", activityTitle: "Attendance Register Review" }, { text: "Learning quality spot-check done", activityTitle: "Learning Quality Spot-Check" }, { text: "Material needs noted", activityTitle: "Material Needs Note" }] },
        { title: `Children: Monthly Training — ${clusters}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly children's programme training. Reinforce with coordinator.", checklist: [{ text: "Full session attended", activityTitle: "Full Training Session Attendance", completionType: "Voice" }, { text: "Key points shared with coordinator", activityTitle: "Key Points Coordinator Briefing" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }] },
        { title: `Youth: Fortnightly Centre Visit + CAP Review — ${clusters}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Visit youth centre fortnightly (every other Saturday). Lighter than typical given lower scale.", checklist: [{ text: "Visit 1 (fortnight 1): centre visited", activityTitle: "Youth Centre Visit & CAP Review", completionType: "Voice" }, { text: "Visit 1: youth groups met, CAP reviewed", activityTitle: "Youth Group CAP Review", completionType: "Voice" }, { text: "Visit 2 (fortnight 2): centre visited", activityTitle: "Youth Centre Visit (Fortnight 2)", completionType: "Voice" }, { text: "Visit 2: youth groups met, CAP reviewed", activityTitle: "Youth Group CAP Review (2)", completionType: "Voice" }, { text: "Issues and wins documented", activityTitle: "Issues & Wins Documentation" }] },
        { title: `Youth: Monthly Training — ${clusters}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly youth programme training.", checklist: [{ text: "Full session attended", activityTitle: "Full Training Session Attendance", completionType: "Voice" }, { text: "Coordinator briefed post-training", activityTitle: "Post-Training Coordinator Briefing", completionType: "Voice" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }] },
        { title: `Elderly: Monthly Review + Team Training — ${clusters}`, type: "Review", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Combined monthly session: review centre + outreach, then conduct team training in one visit day.", checklist: [{ text: "Centre visited and operations observed", activityTitle: "Elderly Centre Monthly Visit", completionType: "Voice" }, { text: "Outreach coverage reviewed", activityTitle: "Outreach Coverage Review" }, { text: "Caregiver welfare checked", activityTitle: "Caregiver Welfare Check" }, { text: "Training topic delivered", activityTitle: "Team Training Delivery", completionType: "Voice" }, { text: "Action points documented", activityTitle: "Training Action Points Documentation", completionType: "Upload" }] },
        { title: `Elderly: Field Day with CO — ${clusters}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Spend one day with the community organizer on the field. Base cluster typically has 1 CO.", checklist: [{ text: "Field day with CO completed", activityTitle: "CO Field Day", completionType: "Voice" }, { text: "Outreach households visited and observed", activityTitle: "Outreach Household Observation" }, { text: "CO capacity gaps identified", activityTitle: "CO Capacity Gap Identification" }, { text: "Coaching provided", activityTitle: "CO Field Coaching" }, { text: "Observations documented", activityTitle: "Field Observation Documentation" }] },
        { title: `Elderly: CSO Referral Mapping — ${clusters}`, type: "Research", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Map and establish CSO / govt service referrals for elderly in all base clusters.", checklist: [{ text: "CSOs / govt services identified", activityTitle: "CSO & Govt Service Identification" }, { text: "At least 1 new referral contact established per cluster", activityTitle: "New Referral Contact Establishment" }, { text: "Referral directory updated", activityTitle: "Referral Directory Update" }, { text: "At least 1 referral completed and documented", activityTitle: "Referral Documentation" }] },
        { title: `Creche: Monthly Rounds — ${clusters}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly visits to all creches across base clusters (~5–6 per cluster). ~1.5 days per cluster.", checklist: [{ text: "All creches in all base clusters visited", activityTitle: "Monthly Creche Round Visit", completionType: "Voice" }, { text: "Caregiver conduct observed", activityTitle: "Caregiver Conduct Observation", completionType: "Voice" }, { text: "Child nutrition records reviewed", activityTitle: "Child Nutrition Records Review" }, { text: "Hygiene and safety checked", activityTitle: "Creche Hygiene & Safety Check" }, { text: "Issues flagged to supervisor", activityTitle: "Issues Flag to Supervisor" }, { text: "Creche visit log updated", activityTitle: "Creche Visit Log Update" }] },
        { title: `Creche: Supervisor Review — ${clusters}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with creche supervisors covering all base clusters.", checklist: [{ text: "Supervisors for all clusters attended", activityTitle: "Creche Supervisor Review Meeting" }, { text: "Monthly rounds findings discussed", activityTitle: "Monthly Rounds Findings Discussion", completionType: "Voice" }, { text: "Caregiver concerns addressed", activityTitle: "Caregiver Concerns Resolution" }, { text: "Action items documented", activityTitle: "Supervisor Review Action Items" }] },
        { title: "City / Zonal Team Review", type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly city or zonal review. Present updates across all base clusters.", checklist: [{ text: "Attended review", activityTitle: "City/Zonal Team Review Meeting" }, { text: "Update presented for all clusters", activityTitle: "Multi-Cluster Update Presentation" }, { text: "Cross-learning shared", activityTitle: "Cross-Learning Sharing" }, { text: "Action items noted", activityTitle: "Review Action Items Note" }] },
        { title: `Quarterly Report — ${clusters}`, type: "Review", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Quarterly report covering all base clusters managed in one document.", checklist: [{ text: "Data compiled for all clusters", activityTitle: "Multi-Cluster Data Compilation", completionType: "Upload" }, { text: "Partner inputs received", activityTitle: "Partner Inputs Collection" }, { text: "Challenges and learnings written", activityTitle: "Challenges & Learnings Writing" }, { text: "Next quarter priorities per cluster drafted", activityTitle: "Per-Cluster Priorities Drafting" }, { text: "Report reviewed with PM and submitted", activityTitle: "Quarterly Report Review & Submission" }] },
        { title: "Documentation and Desk Work", type: "Custom", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Field notes, MIS updates, communications across 2–3 clusters.", checklist: [{ text: "Field notes compiled for all clusters", activityTitle: "Multi-Cluster Field Notes Compilation", completionType: "Upload" }, { text: "MIS updated for all clusters", activityTitle: "Multi-Cluster MIS Update" }, { text: "Partner communications responded to", activityTitle: "Partner Communications Response" }, { text: "Leave and attendance recorded", activityTitle: "Leave & Attendance Recording" }] },
      ];
    },
  },
  {
    id: "rp-full-coverage",
    name: "Cluster Work Plan — Full Coverage Cluster",
    description: "Quarterly work plan for a Resource Person covering one full coverage cluster (saturation mode). 2–4 children's centres, 2+ youth centres, ~22 creches. 35–39 working days/month.",
    category: "Field Programmes",
    icon: "🏙️",
    parameters: [
      { key: "clusterName", label: "Cluster name", type: "text", placeholder: "e.g. Majestic" },
      { key: "childrenCentres", label: "Number of children's centres", type: "number", min: 2, max: 6, placeholder: "e.g. 3" },
      { key: "creches", label: "Number of creches", type: "number", min: 11, max: 50, placeholder: "e.g. 22" },
    ],
    build(params) {
      const cluster = String(params.clusterName || "Cluster");
      const cc = Number(params.childrenCentres) || 3;
      const n = Number(params.creches) || 22;
      const centreChecklist = Array.from({ length: cc }, (_, i) => [
        { text: `Centre ${i + 1}: visit 1 of 2 this week`, activityTitle: `Children's Centre ${i + 1} Visit`, completionType: "Voice" },
        { text: `Centre ${i + 1}: visit 2 of 2 this week`, activityTitle: `Children's Centre ${i + 1} Visit (2nd)`, completionType: "Voice" },
      ]).flat();
      return [
        // WR — same as typical
        { title: `WR: Community Group Meeting — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly meeting with all community groups. Full coverage may have more slums — ensure all are represented.", checklist: [{ text: "Pre-meeting agenda circulated", activityTitle: "Pre-Meeting Agenda Circulation" }, { text: "All community groups represented", activityTitle: "Community Group Monthly Meeting", completionType: "Voice" }, { text: "Active WR cases reviewed", activityTitle: "Active WR Cases Review" }, { text: "Issues documented", activityTitle: "Issues Documentation" }, { text: "Follow-up actions assigned", activityTitle: "Follow-up Action Assignment" }, { text: "Notes shared with partner", activityTitle: "Meeting Notes Distribution" }] },
        { title: `WR: Partner Review Meeting — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with partner team. Full coverage may have more COs — plan extra time.", checklist: [{ text: "All COs and coordinator present", activityTitle: "Partner Review Meeting" }, { text: "Previous month actions reviewed", activityTitle: "Previous Month Actions Review" }, { text: "Pending cases updated", activityTitle: "Pending Cases Status Update" }, { text: "Next month priorities agreed", activityTitle: "Next Month Priorities Agreement" }] },
        { title: `WR: Rights Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly training on civic amenities, land, housing rights, and welfare schemes.", checklist: [{ text: "Topic selected", activityTitle: "WR Training Topic Selection" }, { text: "Material prepared", activityTitle: "Training Material Preparation" }, { text: "All COs attended", activityTitle: "WR Rights Training", completionType: "Voice" }, { text: "Practice included", activityTitle: "Rights Training Role-Play", completionType: "Voice" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }] },
        // CHILDREN — multiple centres + weekly school
        { title: `Children: Centre Visits — All ${cc} Centres (Twice-Weekly) — ${cluster}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: `Visit each of the ${cc} children's centres twice a week. This is the highest-effort item (~8–12 days/month).`, checklist: [...centreChecklist, { text: "Coordinator support given at each centre", activityTitle: "Coordinator Activity Support" }, { text: "Learning quality spot-check in at least 2 centres", activityTitle: "Learning Quality Spot-Check" }, { text: "Issues and material needs flagged", activityTitle: "Infrastructure & Material Needs Flag" }] },
        { title: `Children: Monthly Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly training. With multiple centres, ensure all coordinators are briefed post-session.", checklist: [{ text: "Full session attended", activityTitle: "Full Training Session Attendance", completionType: "Voice" }, { text: `All ${cc} centre coordinators briefed`, activityTitle: "All Centre Coordinators Briefed" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }] },
        { title: `Children: Weekly Govt School Visit + DI Coordination — ${cluster}`, type: "Meeting", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Weekly school visit (¼ day). Full coverage includes active school-community work and dropout tracking.", checklist: [{ text: "Target school visited this week", activityTitle: "School / DI Coordination Visit", completionType: "Voice" }, { text: "School head / teacher met", activityTitle: "School Head / Teacher Meeting" }, { text: "Out-of-school / dropout follow-up done", activityTitle: "Dropout Follow-up with Partner" }, { text: "DI coordination progressed", activityTitle: "DI Coordination Progress" }, { text: "Field notes recorded", activityTitle: "School Visit Field Notes", completionType: "Voice" }] },
        // YOUTH — multiple centres
        { title: `Youth: Saturday Visits — All Centres + CAP Review — ${cluster}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Visit all youth centres every Saturday and review CAP progress. Full coverage has 2–3 centres.", checklist: [{ text: "Youth Centre 1 visited", activityTitle: "Youth Centre Visit & CAP Review", completionType: "Voice" }, { text: "Youth Centre 2 visited", activityTitle: "Youth Centre 2 Visit", completionType: "Voice" }, { text: "Youth Centre 3 visited (if applicable)", activityTitle: "Youth Centre 3 Visit", completionType: "Voice" }, { text: "Youth groups met for CAP review in each centre", activityTitle: "Youth Group CAP Review", completionType: "Voice" }, { text: "CAP milestones updated", activityTitle: "CAP Milestone Update" }, { text: "Each coordinator supported", activityTitle: "Youth Coordinator Support" }] },
        { title: `Youth: Monthly Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly training. Ensure all centre coordinators are briefed.", checklist: [{ text: "Full session attended", activityTitle: "Full Training Session Attendance", completionType: "Voice" }, { text: "All youth coordinators briefed", activityTitle: "All Youth Coordinators Briefed" }, { text: "Attendance recorded", activityTitle: "Training Attendance Recording" }] },
        // ELDERLY — same as typical
        { title: `Elderly: Monthly Centre and Outreach Review — ${cluster}`, type: "Review", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review of elderly care centre and outreach. No change from typical cluster.", checklist: [{ text: "Centre visited", activityTitle: "Elderly Centre Monthly Visit", completionType: "Voice" }, { text: "Outreach coverage reviewed", activityTitle: "Outreach Coverage vs Target Review" }, { text: "Caregiver welfare checked", activityTitle: "Caregiver Welfare Check" }, { text: "Referral cases followed up", activityTitle: "Health Referral Cases Follow-up" }, { text: "Issues escalated", activityTitle: "Issues Escalation with Owners" }] },
        { title: `Elderly: Monthly Team Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly training for the full elderly care team.", checklist: [{ text: "All staff attended", activityTitle: "Full Staff Training Attendance", completionType: "Voice" }, { text: "Training topic prepared", activityTitle: "Training Topic Preparation", completionType: "Voice" }, { text: "Action points documented", activityTitle: "Training Action Points Documentation", completionType: "Upload" }] },
        { title: `Elderly: Field Day with COs — ${cluster}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "One full day each with CO-1 and CO-2. 2 days/month total.", checklist: [{ text: "Field day with CO-1 completed", activityTitle: "CO Field Day", completionType: "Voice" }, { text: "Field day with CO-2 completed", activityTitle: "CO Field Day (CO-2)", completionType: "Voice" }, { text: "Observations documented for both", activityTitle: "CO Field Observations Documentation" }, { text: "Coaching provided", activityTitle: "CO Coaching & Support" }] },
        { title: `Elderly: CSO Referral Network — ${cluster}`, type: "Research", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Map and maintain referral network. Full coverage = higher referral volume — ensure network is active.", checklist: [{ text: "Referral directory reviewed and updated", activityTitle: "Referral Directory Review & Update" }, { text: "At least 2 new contacts added", activityTitle: "New Referral Contact Addition" }, { text: "Referral utilisation data compiled", activityTitle: "Referral Utilisation Data Compilation", completionType: "Upload" }, { text: "At least 2 successful referrals documented", activityTitle: "Successful Referrals Documentation" }, { text: "Referral gaps identified and actioned", activityTitle: "Referral Gap Identification & Action" }] },
        // CRECHES — double
        { title: `Creche: Monthly Rounds — All ${n} Creches — ${cluster}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: `Monthly 2-hour visit to each of the ${n} creches. Plan as a 2-week rolling schedule (~6 days/month).`, checklist: [{ text: "Week 1: first batch of creches visited", activityTitle: "Monthly Creche Round Visit", completionType: "Voice" }, { text: "Week 2: second batch visited", activityTitle: "Creche Round Visit Week 2", completionType: "Voice" }, { text: "Week 3: third batch visited", activityTitle: "Creche Round Visit Week 3", completionType: "Voice" }, { text: "Week 4: fourth batch visited", activityTitle: "Creche Round Visit Week 4", completionType: "Voice" }, { text: "Caregiver conduct observed in all creches", activityTitle: "Caregiver Conduct Observation", completionType: "Voice" }, { text: "Nutrition records reviewed", activityTitle: "Child Nutrition Records Review" }, { text: "Safety checks done", activityTitle: "Creche Hygiene & Safety Check" }, { text: "Concerns flagged same day", activityTitle: "Issues Flag to Supervisor" }, { text: `All ${n} creches logged`, activityTitle: "Creche Visit Log Update" }] },
        { title: `Creche: Supervisor Review — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with both creche supervisors.", checklist: [{ text: "Both supervisors present", activityTitle: "Creche Supervisor Review Meeting" }, { text: "Rounds findings discussed", activityTitle: "Monthly Rounds Findings Discussion", completionType: "Voice" }, { text: "Caregiver issues addressed", activityTitle: "Caregiver Performance Issue Resolution" }, { text: "Expansion pipeline reviewed", activityTitle: "New Creche Pipeline Review" }, { text: "Action items documented", activityTitle: "Supervisor Review Action Items" }] },
        // ADMIN
        { title: "City / Zonal Team Review", type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly city/zonal review. Full coverage RP's cluster is a benchmark — bring detailed updates.", checklist: [{ text: "Attended review", activityTitle: "City/Zonal Team Review Meeting" }, { text: "Detailed cluster update presented", activityTitle: "Cluster Update Presentation" }, { text: "Lessons from full coverage shared", activityTitle: "Cross-Learning Sharing" }, { text: "Systemic issues flagged to PM", activityTitle: "Systemic Issues Flag to PM" }, { text: "Action items noted", activityTitle: "Review Action Items Note" }] },
        { title: "Quarterly Report and Programme Review", type: "Review", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Most comprehensive quarterly report. Captures the saturation model in practice and informs planning.", checklist: [{ text: "WR data compiled", activityTitle: "WR Data Compilation", completionType: "Upload" }, { text: `Children data — all ${cc} centres compiled`, activityTitle: "All Centres Children Data Compilation", completionType: "Upload" }, { text: "Youth data — all centres compiled", activityTitle: "Youth Data Compilation", completionType: "Upload" }, { text: "Elderly data compiled", activityTitle: "Elderly Data Compilation", completionType: "Upload" }, { text: `Creche data — all ${n} creches compiled`, activityTitle: "All Creches Data Compilation", completionType: "Upload" }, { text: "School engagement outcomes documented", activityTitle: "School Engagement Outcomes Documentation" }, { text: "Partner inputs received", activityTitle: "Partner Inputs Collection" }, { text: "What-worked / what-didn't section included", activityTitle: "What Worked / Didn't Section Writing" }, { text: "Next quarter priorities drafted", activityTitle: "Next Quarter Priorities Drafting" }, { text: "Report reviewed with PM and submitted", activityTitle: "Quarterly Report PM Review & Submission" }] },
        { title: "Documentation and Desk Work", type: "Custom", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "~2 days/month. Volume is higher in full coverage given more centres and partner touchpoints.", checklist: [{ text: "Field notes from all centres compiled", activityTitle: "All Centres Field Notes Compilation", completionType: "Upload" }, { text: "MIS updated (all domains)", activityTitle: "All-Domain MIS Update" }, { text: "Partner communications responded to", activityTitle: "Partner Communications Response" }, { text: "Escalations followed up", activityTitle: "Escalation Follow-up" }, { text: "Leave and attendance recorded", activityTitle: "Leave & Attendance Recording" }] },
      ];
    },
  },
  {
    id: "scheme-linkage-drive",
    name: "Scheme Linkage & Entitlements Drive",
    description: "CO-led household-level campaign to maximise entitlement coverage in urban slum communities. Covers linelisting, baseline survey, document rectification (Aadhaar, income cert, ration card, Jan Dhan), and enrollment drives for CMCHIS, PMJAY, PMJJBY, PMSBY, APY, welfare pensions, PMAY, and voter ID.",
    category: "Community Programs",
    icon: "📋",
    parameters: [
      {
        key: "households",
        label: "Number of households",
        type: "number",
        min: 50,
        max: 1000000,
        placeholder: "e.g. 500",
      },
    ],
    build: wrapWithTags(buildSchemeLinkageTemplate),
  },

  // ── Zonal Leadership ──────────────────────────────────────────────────────

  {
    id: "zone-review",
    name: "Zone Review Cadence",
    description: "Monthly or quarterly review rhythm across your zone. Covers RP data audits, variance reporting, zone review meetings, and the annual zone plan.",
    category: "Zonal Leadership",
    icon: "📊",
    parameters: [
      {
        key: "rpCount",
        label: "Number of RPs in your zone",
        type: "number",
        min: 1,
        max: 50,
        placeholder: "e.g. 6",
      },
      {
        key: "reviewFrequency",
        label: "Review frequency",
        type: "choice",
        options: [
          { value: "Monthly", label: "Monthly" },
          { value: "Quarterly", label: "Quarterly" },
        ],
      },
    ],
    build: wrapWithTags(buildZoneReviewTemplate),
  },
  {
    id: "grant-proposal",
    name: "Grant & Proposal Management",
    description: "End-to-end proposal lifecycle for a single funder — from needs assessment and concept note through full proposal, funder engagement, and grant agreement execution.",
    category: "Zonal Leadership",
    icon: "📝",
    parameters: [
      {
        key: "funderName",
        label: "Funder / grant name",
        type: "text",
        placeholder: "e.g. HDFC Foundation, CSRBOX, State ICDS",
      },
      {
        key: "track",
        label: "Type of proposal",
        type: "choice",
        options: [
          { value: "new", label: "New programme / funder" },
          { value: "renewal", label: "Renewal or scale-up" },
        ],
      },
    ],
    build: wrapWithTags(buildGrantProposalTemplate),
  },
  {
    id: "partner-management",
    name: "Partner Relationship Management",
    description: "Full partnership lifecycle for implementation or referral partners — due diligence, MOU, onboarding, quarterly joint reviews, deliverable audits, and annual health review.",
    category: "Zonal Leadership",
    icon: "🤝",
    parameters: [
      {
        key: "partnerCount",
        label: "Number of partners",
        type: "number",
        min: 1,
        max: 20,
        placeholder: "e.g. 3",
      },
      {
        key: "track",
        label: "Partnership stage",
        type: "choice",
        options: [
          { value: "new", label: "New partners (include due diligence & MOU)" },
          { value: "existing", label: "Existing partners (ongoing management only)" },
        ],
      },
    ],
    build: wrapWithTags(buildPartnerManagementTemplate),
  },
  {
    id: "capacity-building",
    name: "Capacity Building Plan",
    description: "Structured RP development cycle — training needs assessment, quarterly skills sessions, peer learning, individual coaching, and quarterly impact assessment.",
    category: "Zonal Leadership",
    icon: "🎓",
    parameters: [
      {
        key: "rpCount",
        label: "Number of RPs to develop",
        type: "number",
        min: 1,
        max: 50,
        placeholder: "e.g. 6",
      },
      {
        key: "focus",
        label: "Capability focus area",
        type: "choice",
        options: [
          { value: "all",          label: "All domains (comprehensive)" },
          { value: "field",        label: "Field skills & community practice" },
          { value: "data",         label: "Data management & MIS" },
          { value: "facilitation", label: "Community facilitation & group work" },
        ],
      },
    ],
    build: wrapWithTags(buildCapacityBuildingTemplate),
  },
];

export function getTemplate(id: string): GoalTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
