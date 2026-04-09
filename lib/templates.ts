// ── Goal Template definitions ─────────────────────────────────────────────────
// Templates are defined in code. Each template can produce a goal + pitstops
// when applied. Some pitstops scale based on input parameters (e.g. # creches).

export interface ChecklistItemTemplate {
  text: string;
}

export interface PitstopTemplate {
  title: string;
  type: string;
  notes: string;
  slaDays: number;         // target date = goal start + slaDays
  startSlaDays: number;    // start date = goal start + startSlaDays
  checklist: ChecklistItemTemplate[];
}

export interface GoalTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  parameters: TemplateParameter[];
  build: (params: Record<string, string | number>) => PitstopTemplate[];
}

export interface TemplateParameter {
  key: string;
  label: string;
  type: "number" | "text";
  min?: number;
  max?: number;
  placeholder?: string;
}

// ── Creche Program Template ───────────────────────────────────────────────────

function buildCrecheTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const n = Number(params.creches) || 1;
  const trainingBatches = Math.ceil((n * 2) / 24);   // 2 caregivers per creche, 24 per batch
  const facilityClusters = Math.ceil(n / 10);         // 10 creches per supervisor cluster
  const needsSafetyCoord = n >= 40;

  const pitstops: PitstopTemplate[] = [
    {
      title: "Team Recruitment & Induction",
      type: "Training",
      notes: `Recruit and induct core program team. For ${n} creches you will need: 1 Program Manager, ${Math.ceil(n / 40)} Cluster Coordinator(s), ${Math.ceil(n / 10)} Creche Supervisor(s)${needsSafetyCoord ? ", 1 Safety Coordinator" : ""}, 1 Training Coordinator, 1 Logistics Coordinator, 1 MIS Coordinator.`,
      startSlaDays: 0,
      slaDays: 14,
      checklist: [
        { text: "Recruit Program Manager" },
        { text: "Recruit Training Coordinator" },
        { text: "Recruit Logistics Coordinator" },
        { text: "Recruit MIS Coordinator" },
        { text: `Recruit ${Math.ceil(n / 40)} Cluster Coordinator(s)` },
        { text: `Recruit ${Math.ceil(n / 10)} Creche Supervisor(s)` },
        ...(needsSafetyCoord ? [{ text: "Recruit Safety Coordinator (required for 40+ creches)" }] : []),
        { text: "Conduct team induction and orientation" },
        { text: "Set up team communication channels" },
      ],
    },
    {
      title: "Government Liaison & Approvals",
      type: "Meeting",
      notes: "Establish formal relationship with district authorities. All outreach must be done under Program Officer guidance.",
      startSlaDays: 7,
      slaDays: 21,
      checklist: [
        { text: "Submit formal letter to District Collector" },
        { text: "Distribute letter to CDPO, DPO, BDO, and Block Health Officer" },
        { text: "Meet with District/Block officials to explain program" },
        { text: "Obtain necessary approvals or NOCs" },
        { text: "Collect secondary demographic data (0-3 year olds in target area)" },
        { text: "Identify vulnerable/priority populations" },
      ],
    },
    {
      title: "Village Identification & Line Listing",
      type: "Research",
      notes: `Identify and confirm ${n} target villages/locations for creche placement. Each creche serves 15-20 children from a single village.`,
      startSlaDays: 14,
      slaDays: 30,
      checklist: [
        { text: "Analyse secondary data to shortlist villages" },
        { text: "Conduct field visits to shortlisted villages" },
        { text: `Confirm ${n} villages meeting eligibility criteria` },
        { text: "Conduct line listing of all 0-3 year olds in each village" },
        { text: "Document household enumeration data" },
        { text: "Enter data into Shishughar MIS" },
      ],
    },
    {
      title: "Gram Sabha & Community Engagement",
      type: "Meeting",
      notes: "Conduct community meetings in each village to introduce the program, build trust, and identify caregivers. Gram Sabha must include all community adults.",
      startSlaDays: 21,
      slaDays: 45,
      checklist: [
        { text: "Schedule and conduct Gram Sabha in each village" },
        { text: "Explain creche program, benefits, and difference from Anganwadi" },
        { text: "Discuss caregiver roles, responsibilities, and stipend" },
        { text: "Identify 2-3 potential caregiver candidates with community nomination" },
        { text: "Explain Creche Management Committee (CMC) concept" },
        { text: "Address community concerns and questions" },
        { text: "Document meeting minutes and attendance" },
      ],
    },
    {
      title: "Caregiver Selection",
      type: "Review",
      notes: `Select 2 caregivers per creche (${n * 2} total). Must be from the same village, trusted by community, ideally from vulnerable backgrounds. At least one must be literate.`,
      startSlaDays: 30,
      slaDays: 50,
      checklist: [
        { text: "Shortlist candidates using 10-point assessment criteria" },
        { text: "Verify: prior child care experience, physical capability, willingness to learn" },
        { text: "Verify: community trust and standing" },
        { text: "Verify: representation from multiple hamlets in village" },
        { text: "Verify: at least one candidate is literate" },
        { text: "Prioritise economically/socially vulnerable candidates" },
        { text: "Avoid candidates from affluent backgrounds" },
        { text: `Finalise ${n * 2} caregivers (2 per creche)` },
        { text: "Conduct background check and collect documents" },
        { text: "Form Creche Management Committee (CMC) with parents and community" },
      ],
    },
    {
      title: "Facility Selection & Preparation",
      type: "SiteVisit",
      notes: `Identify and prepare facilities for all ${n} creches. Each facility must be centrally located, have piped water, electricity, and a functional toilet. Execute rent agreements.`,
      startSlaDays: 35,
      slaDays: 60,
      checklist: [
        { text: "Identify facility meeting safety criteria in each village" },
        { text: "Verify: central location, piped water, electricity, functional toilet" },
        { text: "Execute rent agreement for each facility" },
        { text: "Install/repair toilets if needed" },
        { text: "Set up LPG/smokeless chulha and kitchen area" },
        { text: "Arrange water purification system (boil + filter)" },
        { text: "Install safety gates to separate kitchen from play area" },
        { text: "Set up fencing and safe outdoor play area" },
        { text: "Arrange for fans, lights, and ventilation" },
        { text: "Install signage and collateral materials" },
      ],
    },
    {
      title: "Procurement & Infrastructure Setup",
      type: "Budgeting",
      notes: `Procure all one-time and recurring supplies for ${n} creches. Logistics Coordinator leads procurement. LPG must be under commercial account in organisation name. Maintain 1 extra LPG cylinder per 10-creche cluster.`,
      startSlaDays: 40,
      slaDays: 65,
      checklist: [
        { text: "Identify and approve vendors (pre-approved list for equipment, local for groceries)" },
        { text: "Procure weighing scales and infantometers/stadiometers" },
        { text: "Procure cooking equipment (pressure cookers, vessels, storage containers)" },
        { text: `Procure fire safety equipment (${n} extinguishers, fire blankets, sand buckets)` },
        { text: "Procure first-aid boxes and stock with required supplies" },
        { text: "Procure mattresses, blankets, and mosquito nets" },
        { text: "Procure play materials and age-appropriate toys (10+ types)" },
        { text: `Set up LPG commercial accounts (${n} cylinders + ${facilityClusters} spares)` },
        { text: "Procure registers (all 8 types) for each creche" },
        { text: "Procure opening stock of food (rice, dal, oil, jaggery, vegetables)" },
        { text: "Document all procurement in stock register" },
      ],
    },
    ...Array.from({ length: trainingBatches }, (_, i) => ({
      title: `Pre-Service Training — Batch ${i + 1}${trainingBatches > 1 ? ` of ${trainingBatches}` : ""}`,
      type: "Training",
      notes: `5-day residential training for caregivers. Batch ${i + 1}: ${Math.min(24, n * 2 - i * 24)} caregivers. Max 24 per batch. Requires 2 facilitators, sample creche setup, and childcare for trainees' children.`,
      startSlaDays: 60 + i * 7,
      slaDays: 75 + i * 7,
      checklist: [
        { text: "Book residential training venue" },
        { text: "Arrange childcare for trainees' own children during training" },
        { text: "Prepare sample creche setup at training venue" },
        { text: "Day 1: Exposure visit to an operational creche" },
        { text: "Day 2: Context, child needs, caregiver roles, safety protocols" },
        { text: "Day 3: Food storage, water, egg handling, cooking demos, feeding practices" },
        { text: "Day 4: Child care, hygiene, engagement activities, first aid demo" },
        { text: "Day 5: Operations, registers, fire safety demonstration" },
        { text: "Conduct competency assessment of all trainees" },
        { text: "Distribute training materials and registers to each caregiver" },
      ],
    })),
    {
      title: "Operations Launch — Child Enrollment",
      type: "Meeting",
      notes: `Launch all ${n} creches and begin child enrollment. Target 15-20 children per creche. Enroll each child in Shishughar app and complete child cards.`,
      startSlaDays: 75 + (trainingBatches - 1) * 7,
      slaDays: 90 + (trainingBatches - 1) * 7,
      checklist: [
        { text: "Confirm facility readiness (safety checklist — 24 points)" },
        { text: "Conduct pre-opening community meeting and announce start date" },
        { text: "Enroll children (name, age, gender, health history, emergency contacts)" },
        { text: "Obtain consent for growth monitoring and photography" },
        { text: "Register each child in Shishughar app and child card" },
        { text: "Conduct baseline weight and height measurement for all enrolled children" },
        { text: "Brief parents on daily schedule (8:30 AM - 3:30 PM) and nutrition" },
        { text: "Conduct first CMC meeting" },
        { text: "Verify all 8 registers are set up and ready" },
      ],
    },
    {
      title: "Growth Monitoring & Health Linking Setup",
      type: "Review",
      notes: "Establish the monthly growth monitoring cycle and link with local health system (ANMs, AWW, ASHA). Set up equipment calibration schedule.",
      startSlaDays: 85 + (trainingBatches - 1) * 7,
      slaDays: 100 + (trainingBatches - 1) * 7,
      checklist: [
        { text: "Train caregivers on weight measurement (tray method for <2 years)" },
        { text: "Train caregivers on height/length measurement (infantometer vs stadiometer)" },
        { text: "Calibrate all weighing scales and measurement equipment" },
        { text: "Set quarterly calibration schedule (January, April, July, October)" },
        { text: "Establish contact with local ANM, AWW, and ASHA workers" },
        { text: "Map immunisation due dates for all enrolled children in Shishughar" },
        { text: "Set up IFA supplementation tracking (bi-weekly for 6-59 months)" },
        { text: "Establish referral pathway to PHC/CHC" },
        { text: "Brief caregivers on Category A/B/C health alert protocols" },
      ],
    },
    {
      title: "Supervision & Capacity Building Cadence",
      type: "Training",
      notes: `Establish ongoing supportive supervision system. Each supervisor covers 10 creches. Monthly support visits with demonstrations are non-negotiable.`,
      startSlaDays: 90 + (trainingBatches - 1) * 7,
      slaDays: 110 + (trainingBatches - 1) * 7,
      checklist: [
        { text: `Schedule monthly supervisor visit roster for all ${n} creches` },
        { text: "Define in-service training calendar for caregivers" },
        { text: "Set up monthly CMC meeting schedule for all creches" },
        { text: "Schedule quarterly safety audits" },
        { text: "Establish Prabhaat Feri and Nukkad Natak community engagement schedule" },
        { text: "Plan bi-annual Measurement Day celebration" },
        { text: "Set up MIS reporting cadence in Shishughar app" },
        { text: "Conduct first round of supportive supervision visits" },
        { text: "Document and share learnings from first month of operations" },
      ],
    },
  ];

  return pitstops;
}

// ── Welfare Rights Programme Template ────────────────────────────────────────

function buildWelfareRightsTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const clusters = Number(params.clusters) || 1;
  const hhPerCluster = 5000;
  const totalHH = clusters * hhPerCluster;
  const totalCOs = clusters * 3;                         // 2-3 COs per cluster, use 3
  const coTrainingBatches = Math.ceil(totalCOs / 20);    // ~20 per training batch
  const totalMASGroups = Math.ceil(totalHH / 300);       // 1 MAS per 300 HH
  const totalCommunityGroups = Math.ceil(totalHH / 500); // 1 group per ~500 HH
  const totalSettlements = clusters * 7;                 // avg 7 settlements per cluster

  return [
    {
      title: "Team Recruitment & Deployment",
      type: "Milestone",
      notes: `Recruit and deploy the full programme team for ${clusters} cluster(s). Required: 1 Project Coordinator, ${clusters} Cluster Coordinator(s), ${clusters} Resource Centre Coordinator(s), 1 MIS Coordinator, ${totalCOs} Community Organizer(s) (2-3 per cluster). For expansion: COs must be from the community with no prior experience required — only interest and openness to learn.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        { text: "Recruit Project Coordinator" },
        { text: `Recruit ${clusters} Cluster Coordinator(s)` },
        { text: `Recruit ${clusters} Resource Centre Coordinator(s)` },
        { text: "Recruit MIS Coordinator" },
        { text: `Recruit ${totalCOs} Community Organizers (from community, 2-3 per cluster)` },
        { text: "Conduct team induction and orientation session" },
        { text: "Map existing COs — assess interests, capacity, entitlement experience, stakeholder relationships" },
        { text: "Assign COs to clusters and settlements (3-4 slums per CO)" },
        { text: "Set up team communication channels and review cadence" },
      ],
    },
    {
      title: "Cluster & Settlement Mapping",
      type: "Research",
      notes: `Map all ${clusters} cluster(s) covering approx. ${totalHH.toLocaleString()} households across ${totalSettlements} settlements. Each cluster has 6-8 settlements and ~5,000 households. Identify existing community groups (active/inactive), MAS groups, and locate relevant government infrastructure.`,
      startSlaDays: 7,
      slaDays: 35,
      checklist: [
        { text: `Delineate ${clusters} cluster boundary/boundaries with ward/block boundaries` },
        { text: `List all ${totalSettlements} settlements (approx.) in intervention area` },
        { text: "Enumerate household count per settlement" },
        { text: "Identify existing community groups (active, inactive, or absent) per settlement" },
        { text: "Map existing Mahila Arogya Samiti (MAS) groups per settlement" },
        { text: "Locate PHC, Anganwadi, government schools, police station per cluster" },
        { text: "Identify key community leaders and influencers in each settlement" },
        { text: "Document findings in cluster planning sheet and share with team" },
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
        })),
        { text: "Day 1 content: Programme objectives, community group formation, roles & responsibilities" },
        { text: "Day 2 content: Civic amenities baseline — categories, mapping tool, mobile app" },
        { text: "Day 3 content: MAS, Bal Raksha Samiti, SDMC, entitlements, stakeholder engagement" },
        { text: "Distribute mapping tools, registers, and mobile app access to all COs" },
        { text: "Share Year 1 monthly training calendar with all COs" },
      ],
    },
    {
      title: "Community Group Formation & Activation",
      type: "Meeting",
      notes: `Form or activate community groups across all ${totalSettlements} settlements. Target: 1 group per ~500 HH (approx. ${totalCommunityGroups} groups total), 20 members each. Ensure representation of women, parents of school-going children, and across age groups. Each group needs a regular meeting space.`,
      startSlaDays: 30,
      slaDays: 75,
      checklist: [
        { text: "Review existing groups from mapping — categorise as active, inactive, or absent" },
        { text: "For inactive groups: re-engage identified leaders and conduct revival meeting" },
        { text: "For settlements without groups: identify interested members with CO support" },
        { text: "Ensure group composition: women participation, parents of school-going children, cross-age" },
        { text: `Form/activate approx. ${totalCommunityGroups} community groups across all settlements` },
        { text: "Identify and confirm meeting space for each group" },
        { text: "Conduct initial meeting for each group: objectives, roles & responsibilities, monthly schedule" },
        { text: "Introduce civic amenities baseline concept to each group" },
        { text: "Identify 2-3 group leaders per community group" },
        { text: "Document group roster, meeting schedule, and leader contacts in MIS" },
      ],
    },
    {
      title: "Mahila Arogya Samiti (MAS) Setup",
      type: "Meeting",
      notes: `Form or strengthen MAS groups — 1 per 300 households (approx. ${totalMASGroups} groups total). Work with ASHA to form groups where absent. Link each MAS with the local PHC and identify 5 priority health issues per group. Also initiate Bal Raksha Samiti and Vigilance Committee formation as conditions allow.`,
      startSlaDays: 35,
      slaDays: 80,
      checklist: [
        { text: "Map all existing MAS groups with CO support" },
        { text: `Identify gaps — target total of ${totalMASGroups} MAS groups across ${clusters} cluster(s)` },
        { text: "Work with ASHA workers to form MAS where none exist (1 per 300 HH)" },
        { text: "Conduct first MAS meeting in each settlement — introduce programme and roles" },
        { text: "Link each MAS group with local PHC/Medical Officer" },
        { text: "Facilitate identification of 5 priority health issues per MAS group" },
        { text: "Begin Bal Raksha Samiti formation in settlements with school-going children" },
        { text: "Begin Vigilance Committee formation as relevant issues are identified" },
        { text: "Register MAS groups and meeting cadence in MIS" },
      ],
    },
    {
      title: "Civic Amenities Baseline Mapping",
      type: "Research",
      notes: `Conduct a structured baseline mapping of 7 civic amenity categories across all ${totalSettlements} settlements. Use the mobile application and mapping tool. COs work alongside community members in this exercise. Output: settlement-level data on access to toilets, water, drainage, waste collection, streetlights, CCTV, and other issues.`,
      startSlaDays: 45,
      slaDays: 90,
      checklist: [
        { text: "Complete CO training on mapping tool and mobile application" },
        { text: "Map: access to public toilets (availability, functionality, gender-segregated)" },
        { text: "Map: access to regular drinking water supply" },
        { text: "Map: drainage and sewer line coverage" },
        { text: "Map: waste collection frequency and coverage (BBMP or equivalent)" },
        { text: "Map: adequacy of streetlights" },
        { text: "Map: CCTV coverage in blind spots / unsafe areas" },
        { text: "Map: other settlement-specific civic issues identified by community" },
        { text: `Compile findings for all ${totalSettlements} settlements` },
        { text: "Share settlement-level mapping reports with community groups and cluster coordinators" },
        { text: "Prioritise top 3 issues per settlement for action planning" },
      ],
    },
    {
      title: "Stakeholder Engagement & Relationship Building",
      type: "Meeting",
      notes: `Establish structured relationships with key government stakeholders in each cluster: ASHA, ANM, PHC staff, police, nodal officer, Medical Officer, Block/Ward office officers. Conduct first round of stakeholder meetings. Set up regular engagement rhythm based on issues identified in baseline mapping.`,
      startSlaDays: 50,
      slaDays: 90,
      checklist: [
        { text: "Map all relevant stakeholders per cluster: ASHA, ANM, PHC MO, police, ward/block officers" },
        { text: "Introduce programme to each stakeholder with formal letter and CO meeting" },
        { text: "Establish regular meeting schedule with PHC (monthly), police (monthly), ward officer (monthly)" },
        { text: "Conduct first Adalat / grievance forum at slum level in each cluster" },
        { text: "Invite stakeholders to attend cluster-level community group meetings" },
        { text: "Establish referral pathway for GBV/DV cases to police and support services" },
        { text: "Establish referral pathway for housing/land rights to relevant authorities" },
        { text: "Document stakeholder contacts, meeting rhythm, and engagement status per cluster" },
      ],
    },
    {
      title: "MIS & Mobile App Deployment",
      type: "Milestone",
      notes: `Deploy and operationalise the MIS system and mobile application across all COs and coordinators. The app must capture: community group roster and attendance, meeting rhythm and action plans, civic amenity mapping data, entitlements facilitated, DV cases, MAS group data, and stakeholder visits.`,
      startSlaDays: 30,
      slaDays: 60,
      checklist: [
        { text: "Install mobile app on all CO devices" },
        { text: "Create user accounts for all COs, cluster coordinators, and programme team" },
        { text: "Train all COs on data entry: group meetings, attendance, action plans" },
        { text: "Train COs on civic amenities mapping module" },
        { text: "Train COs on entitlement tracking and DV case reporting" },
        { text: "Configure cluster coordinator view: groups, meetings, attendance, action plan status" },
        { text: "Configure MAS tracking module" },
        { text: "Conduct first MIS data quality review (2 weeks after deployment)" },
        { text: "Set up monthly MIS reporting cadence for programme team" },
      ],
    },
    {
      title: "Issue-Based Capacity Building of Community Leaders",
      type: "Training",
      notes: `Based on civic amenities mapping findings, conduct targeted training for community group leaders on specific issues. For example, if waste collection is irregular, train on BBMP process, grievance portal, responsible officer identification. Monthly 1-day training for group leaders planned throughout Year 1.`,
      startSlaDays: 75,
      slaDays: 110,
      checklist: [
        { text: "Review mapping data to identify top 3 issues per cluster" },
        { text: "Design issue-specific training modules for top civic amenity issues" },
        { text: "Train leaders on: how to use grievance redressal portals (BBMP, ward, PHC)" },
        { text: "Train leaders on: how to identify and meet responsible department officer" },
        { text: "Train leaders on: writing complaint letters and follow-up process" },
        { text: "Train leaders on: housing rights and land title deed application process" },
        { text: "Conduct exposure visit for community leaders to a well-functioning similar programme" },
        { text: "Begin tracking resolution rate of issues identified in baseline mapping" },
      ],
    },
    {
      title: "Land Title Deed & Housing Rights Drive",
      type: "Milestone",
      notes: `Facilitate land title deed applications for eligible households across all clusters. COs to spend ~3 days/month on collection of applications and follow-up. Train COs and community leaders on application process. Conduct exposure visits to existing models.`,
      startSlaDays: 60,
      slaDays: 120,
      checklist: [
        { text: "Train COs on land title deed eligibility criteria and application process" },
        { text: "Conduct exposure visit for COs to an existing housing rights model" },
        { text: "Identify eligible households in each settlement" },
        { text: "Conduct application collection drives (CO 3 days/month dedicated)" },
        { text: "Submit applications to relevant authority (municipality/BDA/BBMP)" },
        { text: "Track application status per household in MIS" },
        { text: "Conduct department follow-up visits (monthly)" },
        { text: "Report resolution rate of housing/land rights cases quarterly" },
      ],
    },
    {
      title: "Review & Monitoring Cadence Setup",
      type: "Milestone",
      notes: `Establish the full programme review and supervision architecture. Monthly: CC visits bi-monthly to each CO, resource centre monthly review, foundation team participates in cluster meetings. Key metrics: group meeting cadence, civic issue resolution rate, MAS functioning, entitlements facilitated, DV referrals.`,
      startSlaDays: 90,
      slaDays: 120,
      checklist: [
        { text: "Set Cluster Coordinator bi-monthly visit schedule to each CO's group meetings" },
        { text: "Schedule monthly resource centre review (COs share action plans and status)" },
        { text: "Schedule monthly cluster-level meeting (CC + all COs + community leaders)" },
        { text: "Schedule monthly foundation team participation in cluster meetings" },
        { text: "Schedule monthly Cluster Coordinator review by zone/programme lead" },
        { text: "Define key metrics tracking: group meeting cadence & attendance" },
        { text: "Define key metrics tracking: civic amenity issue resolution rate (one-time and recurring)" },
        { text: "Define key metrics tracking: 100% of members able to resolve frequent category issues" },
        { text: "Define key metrics tracking: MAS meeting frequency and PHC issue resolution" },
        { text: "Define key metrics tracking: land/housing applications filed and resolved" },
        { text: "Define key metrics tracking: DV/GBV referrals made and follow-up status" },
        { text: "Conduct first round of monthly reviews and document learnings" },
      ],
    },
  ];
}

// ── Template registry ─────────────────────────────────────────────────────────

export const TEMPLATES: GoalTemplate[] = [
  {
    id: "creche-program",
    name: "Creche Program",
    description: "End-to-end setup and operations for community creches, based on our protocols. Covers recruitment, govt liaison, community engagement, caregiver training, and ongoing operations.",
    category: "Community Programs",
    icon: "🏠",
    parameters: [
      {
        key: "creches",
        label: "Number of creches",
        type: "number",
        min: 1,
        max: 500,
        placeholder: "e.g. 10",
      },
    ],
    build: buildCrecheTemplate,
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
        max: 20,
        placeholder: "e.g. 2 (each ~5,000 HH, 6-8 settlements)",
      },
    ],
    build: buildWelfareRightsTemplate,
  },
];

export function getTemplate(id: string): GoalTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
