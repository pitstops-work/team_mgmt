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

// ── Children Learning Centre Template ────────────────────────────────────────

function buildChildrenTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const centres = Number(params.centres) || 1;
  const totalChildren = centres * 100;        // 100 children per centre
  const totalCOs = centres * 2;               // 2 outreach workers per centre
  const hasLead = centres > 1;                // children lead required once >1 centre

  return [
    {
      title: "Team Recruitment & Deployment",
      type: "Milestone",
      notes: `Recruit staff for ${centres} Children Learning Centre(s) — 3 staff per centre. Required: ${centres} Centre Coordinator(s) (graduate, preferably from community), ${totalCOs} Children Outreach Worker(s) (from community)${hasLead ? ", 1 Children Lead (mandatory when >1 centre)" : ""}. For expansion: coordinator must be a graduate; outreach workers must be from community; no prior experience required — interest in working with children is essential.`,
      startSlaDays: 0,
      slaDays: 21,
      checklist: [
        ...(hasLead ? [{ text: "Recruit Children Lead (1 per organisation, required for >1 centre)" }] : []),
        { text: `Recruit ${centres} Centre Coordinator(s) — graduate, preferably from community` },
        { text: `Recruit ${totalCOs} Children Outreach Worker(s) — must be from community` },
        { text: "Review and map any existing staff from current programme who are interested and equipped for children work" },
        { text: "Conduct team induction: programme objectives, child rights, safe space principles" },
        { text: "Assign staff to centres and clusters" },
        { text: "Set up team communication channels and weekly review schedule" },
      ],
    },
    {
      title: "Centre Location Identification & Rent Agreement",
      type: "SiteVisit",
      notes: `Identify suitable location(s) for ${centres} Children Learning Centre(s). Each CLC must be within 1–1.5 km radius of the target community. Minimum 400–500 sqft for learning corners, peer discussions, and group activities, plus outdoor play space. Basic facilities — safe drinking water and functional toilets — are non-negotiable.`,
      startSlaDays: 7,
      slaDays: 28,
      checklist: [
        { text: "Shortlist 2–3 potential buildings per cluster (within 1–1.5 km radius of community)" },
        { text: "Verify minimum 400–500 sqft indoor space for learning corners and group activities" },
        { text: "Verify safe drinking water supply" },
        { text: "Verify functional and usable toilets" },
        { text: "Check for outdoor/play space adjacent to or near the building" },
        { text: "Assess ventilation, natural lighting, and basic structural safety" },
        { text: "Confirm with cluster coordinator and children lead" },
        { text: `Execute rent agreement(s) for ${centres} centre location(s)` },
      ],
    },
    {
      title: "Centre Infrastructure Setup & Civil Works",
      type: "Milestone",
      notes: `Set up all ${centres} CLC(s) with a colourful, print-rich, child-friendly environment. Age-specific learning corners for 4–8 year olds: blocks, creative, literacy, numeracy, and dramatic play corners. Fixtures and cubbies at child height. Adequate space for individual engagement, small groups, and whole-class activities.`,
      startSlaDays: 21,
      slaDays: 50,
      checklist: [
        { text: "Conduct painting and civil works — colourful walls, illustrations, print-rich environment" },
        { text: "Install display boards, flannel boards, and notice boards" },
        { text: "Procure and install book racks and cubbies (child-height, easy to access)" },
        { text: "Set up learning corners for 4–8 yrs: blocks, creative, literacy, numeracy, dramatic play" },
        { text: "Procure whiteboard, floor mats, and basic furniture" },
        { text: "Procure 1 laptop and 1 LCD projector; ensure internet connectivity" },
        { text: "Set up safe drinking water facility inside centre" },
        { text: "Verify toilets are clean and functional" },
        { text: "Put up signage and CLC branding" },
        { text: "Conduct safety walkthrough before opening" },
      ],
    },
    {
      title: "Books, TLM & AV Materials Procurement",
      type: "Milestone",
      notes: `Procure all Teaching-Learning Materials (TLM), books, and supplies for ${centres} centre(s). Build a children's library with age-appropriate multilingual books (4–14 yr range). Low-cost and no-cost materials are prioritised. Establish a human resource bank of subject experts and resource persons for co-facilitation. Secure DI (District Institute, Bangalore & Ramanagara) support for capacity building.`,
      startSlaDays: 21,
      slaDays: 45,
      checklist: [
        { text: "Procure age-appropriate multilingual books for library (4–14 year range)" },
        { text: "Procure TLM for language and literacy (letter cards, word puzzles, story books, phonics)" },
        { text: "Procure TLM for maths (number tiles, shapes, dominos, counting games)" },
        { text: "Procure art & craft supplies, indoor games, and board games" },
        { text: "Procure sports equipment for outdoor and indoor play" },
        { text: "Download and organise AV content: nursery rhymes, communicative English, subject experiments, educational documentaries" },
        { text: "Set up library management register (cataloguing and borrowing tracker)" },
        { text: "Build human resource bank — subject experts, life skills facilitators, DI resource persons" },
        { text: "Confirm DI (Bangalore/Ramanagara) support for monthly capacity building visits" },
      ],
    },
    {
      title: "Children Survey & Baseline Learning Assessment",
      type: "Research",
      notes: `Outreach workers conduct door-to-door survey of all children aged 4–14 within 1–1.5 km of each CLC. Identify enrolment status, dropouts, and non-enrolled children. For each child enrolled at the CLC, conduct a friendly informal baseline assessment (oral, worksheet, game-based) — not to grade them, but to help the coordinator plan tailored support. Conducted with DI support.`,
      startSlaDays: 21,
      slaDays: 55,
      checklist: [
        { text: "Outreach workers conduct door-to-door survey of children aged 4–14 in cluster" },
        { text: "Record per child: name, gender, DOB, school/anganwadi status, mother tongue, health concerns" },
        { text: "Identify children with irregular school attendance" },
        { text: "Identify children who have dropped out entirely" },
        { text: "Identify children never enrolled in school or anganwadi" },
        { text: "Conduct baseline learning assessment per child (with DI support) — informal, game-based, not graded" },
        { text: "Assess language: letter recognition, reading words/sentences, listening comprehension" },
        { text: "Assess maths: number recognition, basic operations, word problems" },
        { text: "Assess general awareness for younger children: body parts, colours, surroundings" },
        { text: `Enrol first cohort of ${totalChildren} children across ${centres} centre(s) — enter profiles in MIS` },
        { text: "Prepare per-child activity plan based on assessment findings" },
      ],
    },
    {
      title: "Staff Capacity Building Programme",
      type: "Training",
      notes: `All Centre Coordinators and Outreach Workers undergo 2 days of training per month throughout Year 1 (calendarized). First module covers: safe space facilitation, child development, reading and writing support methods, baseline assessment tools, library circles, and MIS app. DI resource persons support monthly. External resource persons engaged as needed.`,
      startSlaDays: 28,
      slaDays: 50,
      checklist: [
        { text: "Conduct initial 2-day orientation: programme objectives, child rights, safe space principles" },
        { text: "Train on age-appropriate learning support: reading, writing, numeracy — informal methods" },
        { text: "Train on baseline assessment tools (observation, oral, worksheet, game-based)" },
        { text: "Train on facilitating library circles and promoting reading habits" },
        { text: "Train on life skills and socio-emotional learning facilitation" },
        { text: "Train on using AV materials, low-cost and no-cost teaching aids" },
        { text: "Train on MIS app: child profiling, attendance tracking, reading/writing progress, library usage" },
        { text: "Finalise 12-month monthly training calendar with DI support" },
        { text: "Identify and onboard external resource persons for co-facilitation (life skills, digital, sports)" },
      ],
    },
    {
      title: "Centre Operations Launch",
      type: "Meeting",
      notes: `Launch all ${centres} CLC(s) and begin daily operations. Daily schedule: 3:30 pm onwards — safe space + snack for Anganwadi returnees (4–6 yrs); 4:30–6 pm — safe space, homework support, reading/writing for school children (7–14 yrs); 6–7 pm — library circles, movie/documentary screening, art & craft, indoor/outdoor sports, singing and music. Snacks (egg/chana/banana cooked by rotating mothers) for 50 children per day per centre.`,
      startSlaDays: 50,
      slaDays: 65,
      checklist: [
        { text: "Confirm facility readiness: space, materials, staff, water, toilets" },
        { text: "Conduct community meeting to announce CLC launch and daily schedule" },
        { text: "Set up snack programme — identify rotating mothers to cook (egg/chana/banana for 50 children/day)" },
        { text: "Launch 3:30 pm slot: safe space and snack for Anganwadi returnees (4–6 yrs)" },
        { text: "Launch 4:30–6 pm slot: safe space, homework support, reading/writing for school children" },
        { text: "Launch 6–7 pm slot: library circles, art & craft, music, indoor/outdoor sports, movie screenings" },
        { text: "Begin child attendance tracking in MIS from Day 1 (CLC and school attendance)" },
        { text: "Prepare activity plan and weekly schedule (themed sessions, sports, creative activities)" },
        { text: `Confirm all ${totalChildren} children enrolled and profiled in MIS across ${centres} centre(s)` },
      ],
    },
    {
      title: "School & Anganwadi Linkage + Re-enrolment Drive",
      type: "Milestone",
      notes: `Outreach workers run a continuous school and anganwadi linkage programme. Age 4–6: focus on anganwadi enrolment. Age 7–11: maintain school attendance, support with irregular attendees. Age 12–14: targeted re-enrolment and referrals. Outreach workers visit schools monthly, meet teachers, track irregular children, visit anganwadis, and follow up with parents.`,
      startSlaDays: 55,
      slaDays: 90,
      checklist: [
        { text: "Outreach workers visit all govt schools in cluster — meet teachers, collect data on irregular/dropout children" },
        { text: "Visit anganwadis — meet AWW, identify 4–6 yr children not yet enrolled" },
        { text: "Visit parents of identified dropout, irregular, and non-enrolled children" },
        { text: "Facilitate enrolment of 4–6 yr olds in anganwadi" },
        { text: "Facilitate re-enrolment of 7–11 yr dropouts in school" },
        { text: "Engage dropout children at CLC through art, craft, indoor games, and conversations" },
        { text: "Refer 12–14 yr dropouts to bridge courses, open schooling, or vocational options" },
        { text: "Launch back-to-school campaign in community" },
        { text: "Map scholarship entitlements for eligible children (post-matric, minority, SC/ST)" },
        { text: "Track re-enrolment outcomes and school attendance per child in MIS" },
      ],
    },
    {
      title: "Life Skills, Camps & Enrichment Programme",
      type: "Milestone",
      notes: `Establish a structured enrichment programme covering life skills, creative learning, digital literacy, sports, and community events. Life skills sessions once every 15 days. Two camps per year (Summer and Dasara). Quarterly parenting sessions. Annual leadership training for selected children. Exposure visits for children and staff.`,
      startSlaDays: 60,
      slaDays: 100,
      checklist: [
        { text: "Design fortnightly life skills module calendar: decision-making, empathy, hygiene, safety, self-awareness" },
        { text: "Design thematic session calendar: health, child rights, environment, reflection circles, theatre" },
        { text: "Set up peer learning programme — older youth/adolescents as tutors and mentors" },
        { text: "Set up digital literacy sessions (laptop/computer access, basic digital skills)" },
        { text: "Establish weekly outdoor and indoor sports schedule" },
        { text: "Conduct Summer camp (Camp 1 of 2 per year)" },
        { text: "Schedule Dasara camp (Camp 2 of 2)" },
        { text: "Set up quarterly parenting sessions (themes: nutrition, child safety, school support)" },
        { text: "Identify children for annual leadership training programme" },
        { text: "Plan quarterly exposure visits for children; annual exposure visit for staff" },
        { text: "Plan celebration of important days (Children's Day, environment day, child rights day)" },
      ],
    },
    {
      title: "MIS Setup & Monitoring Cadence",
      type: "Milestone",
      notes: `Deploy MIS app across all ${centres} centre(s). Tracks: child profile, CLC and school attendance, reading/writing improvement, library utilisation, activity completion, and scholarship status. Monitoring: Children Lead visits each centre weekly; DI resource person visits monthly (full day) to support and review; urban team member visits fortnightly; monthly coordinator review meeting.`,
      startSlaDays: 45,
      slaDays: 65,
      checklist: [
        { text: "Set up MIS app — enrol all children with full profile and baseline assessment data" },
        { text: "Configure attendance tracking: CLC daily attendance + school frequency per child" },
        { text: "Configure reading progress tracking: improvement across language levels over time" },
        { text: "Configure writing progress tracking" },
        { text: "Configure library module: books taken, reading frequency, participation" },
        { text: "Configure activity tracker: participation level (highly involving / sometimes / not involving)" },
        { text: "Configure scholarship and entitlement tracking per child" },
        { text: `Set Children Lead weekly visit schedule to all ${centres} centre(s) (handholding + review)` },
        { text: "Set DI resource person monthly full-day visit schedule (support, review, capacity building)" },
        { text: "Set urban team fortnightly visit schedule" },
        { text: "Set monthly review meeting: all centre coordinators + children lead" },
        { text: "Conduct first monthly review — share learnings from launch period" },
      ],
    },
  ];
}

// ── Youth Resource Centre Template ────────────────────────────────────────────

function buildYouthTemplate(params: Record<string, string | number>): PitstopTemplate[] {
  const yrcs = Number(params.yrcs) || 1;
  const totalYouth = yrcs * 1000;                      // 1 YRC per cluster, 1000 youth per YRC
  const intensiveYouth = yrcs * 200;                   // each worker closely works with 200
  const youthWorkers = yrcs * 2;                       // 2 workers per YRC
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
        ...(hasYouthLead ? [{ text: "Recruit Youth Lead (1 per organisation, mandatory for ≥2 YRCs)" }] : []),
        { text: `Recruit ${yrcs} YRC Coordinator(s)` },
        { text: `Recruit ${youthWorkers} Youth Worker(s) — must be from community, 2 per YRC` },
        { text: "Map existing community organizers — assess youth relationship-building track record" },
        { text: "Conduct team induction: programme objectives, youth vulnerability context, gender lens" },
        { text: "Contextualise with local data: 32% dropout after 10th grade, 63% working by 21, 28% married before 21" },
        { text: "Brief on local patterns: substance abuse, GBV, early pregnancy, undertrial cases" },
        { text: "Assign workers to YRCs; define reporting relationships" },
        { text: "Set up team communication channels and weekly review rhythm" },
      ],
    },
    {
      title: "YRC Location Selection & Neighbour Sensitisation",
      type: "SiteVisit",
      notes: `Identify location(s) for ${yrcs} Youth Resource Centre(s). Each YRC needs 2–3 rooms and at least 700 sqft. Preferred: close to the community but accessible from the nearest transport point to the slum. Neighbourhood must tolerate noise and late-evening sounds — neighbours must be sensitised with the support of the landlord before signing the agreement.`,
      startSlaDays: 7,
      slaDays: 30,
      checklist: [
        { text: `Shortlist 2–3 candidate locations per YRC — close to community, accessible from transport` },
        { text: "Verify minimum 700 sqft with 2–3 rooms (group space, library/reading area, counselling corner)" },
        { text: "Assess neighbourhood: noise tolerance for evening activities is critical" },
        { text: "Sensitise neighbours about programme purpose with support of landlord" },
        { text: "Verify adequate ventilation, lighting, and safety" },
        { text: `Execute rent agreement(s) for ${yrcs} YRC location(s)` },
        { text: "Confirm location with cluster coordinator and youth team" },
      ],
    },
    {
      title: "YRC Infrastructure Setup",
      type: "Milestone",
      notes: `Set up all ${yrcs} YRC(s) in a participatory manner — identified youth from the community must be involved in painting and furnishing. Each YRC: 2 racks for library books, 30 chairs, 2 tables, 1 projector, 1 screen, WiFi, 1 camera and gear, library with curated books, cultural activity corner, information bank notice board, and a private counselling space.`,
      startSlaDays: 21,
      slaDays: 50,
      checklist: [
        { text: "Involve identified youth from community in painting and furnishing (participatory setup)" },
        { text: "Procure and install 2 book racks for library" },
        { text: "Procure 30 chairs and 2 tables per YRC" },
        { text: "Procure 1 projector, 1 screen, camera and assistive gear per YRC" },
        { text: "Set up WiFi connection" },
        { text: "Build library: curate books on health, legal literacy, financial literacy, career, life skills" },
        { text: "Set up cultural activity corner: musical instruments, indoor board games, art & craft supplies" },
        { text: "Install information bank notice board: schemes, scholarships, helplines, opportunities" },
        { text: "Set up private counselling corner (individual and small group sessions)" },
        { text: "Conduct community announcement of YRC opening" },
        { text: "Finalise YRC visiting hours and daily/weekly activity schedule" },
      ],
    },
    {
      title: "Staff Orientation & Training Programme",
      type: "Training",
      notes: `All youth workers and YRC coordinators undergo a 3-day residential orientation. Followed by 2 days of training per month for the first 6 months (calendarized). Trainings conducted by internal and external resource persons. For existing staff already mapped to the programme, preparatory training of 2 days/month for 3–6 months before launch.`,
      startSlaDays: 14,
      slaDays: 45,
      checklist: [
        { text: "For existing staff: conduct 2-day/month preparatory training for 3–6 months (before official launch)" },
        { text: "Conduct 3-day orientation for all new youth programme staff" },
        { text: "Day 1: programme objectives, youth development context, gender and intersectionality" },
        { text: "Day 2: safe space facilitation, counselling basics, crisis identification and referral" },
        { text: "Day 3: YRC operations, outreach methods, documentation, MIS app" },
        { text: "Finalise 6-month monthly training calendar (2 days/month) with internal and external RPs" },
        { text: "Schedule training themes: SRHR, mental health, legal literacy, financial literacy, constitutional values, digital literacy" },
        { text: "Identify and onboard external resource persons for specialised sessions" },
      ],
    },
    {
      title: "Youth Enumeration & Baseline Survey",
      type: "Research",
      notes: `Enumerate all youth aged 15–21 in each cluster's settlements. Each YRC serves 1000 youth; each worker closely engages 200 and develops 20 leaders. Also enumerate 22–30 year olds for need-based support. MIS captures full profile: education/employment status, documentation access, caste, religion, dropout reasons if applicable.`,
      startSlaDays: 21,
      slaDays: 60,
      checklist: [
        { text: `Enumerate youth aged 15–21 in all settlements — target ${totalYouth} total across ${yrcs} YRC(s)` },
        { text: "Record: name, gender, DOB, caste, religion, mother tongue, cluster/slum, contact, family details" },
        { text: "Record education/employment status: studying, studying+working, working, homemaker, job-seeking, dropout" },
        { text: "For dropouts: record reasons (financial, family emergency, marriage, substance use, lack of interest, etc.)" },
        { text: "Record documentation access: Aadhaar, voter ID, bank account, ration card, caste/income certificate" },
        { text: "Assess scholarship access: post-matric, BBMP fee reimbursement, Yuva Spandana, APF scholarship" },
        { text: "Identify at-risk youth: substance abuse, GBV, potential early marriage, trafficking signs, undertrial" },
        { text: "Enumerate 22–30 yr olds separately for need-based support tracking" },
        { text: "Enter all baseline data into MIS; assign each worker their 500-youth caseload" },
      ],
    },
    {
      title: "Small Group Meetings & YRC Activation",
      type: "Meeting",
      notes: `Youth workers conduct regular small group meetings in settlements to build rapport, introduce the YRC, and identify interested youth. Build footfall at the YRC through cultural activities, sports, and monthly awareness meetings. Identify the 200 youth per worker who will be closely engaged and the leadership pipeline of 20 per worker.`,
      startSlaDays: 35,
      slaDays: 80,
      checklist: [
        { text: "Conduct first round of small group meetings per settlement — introduce YRC and programme" },
        { text: "Hold awareness meetings at slum level (monthly)" },
        { text: "Set up cultural activities at YRC: musical instruments, indoor games, art & craft (daily/weekly)" },
        { text: "Organise first outdoor sports event or youth cultural programme for broad mobilisation" },
        { text: "Identify from meetings: 200 youth per worker for close engagement" },
        { text: "Identify from meetings: 20 youth per worker showing leadership interest (pipeline)" },
        { text: "Track YRC footfall: new youth visiting YRC, youth visiting repeatedly (>2 times/month)" },
        { text: "Document issues and needs raised in small group meetings — feed into activity planning" },
        { text: "Begin monthly awareness meetings with relevant stakeholders (ASHA, police, school, PHC)" },
      ],
    },
    {
      title: "Thematic Sessions & Capacity Building for Youth",
      type: "Training",
      notes: `Facilitate monthly thematic sessions at the YRC. Quarterly Yuva Adda on gender, GBV, constitution, caste, pluralism, environment. 2-day capacity-building workshops for youth (batches). Topics: health, reproductive health, nutrition, mental health, legal literacy, financial literacy, constitutional values, digital literacy, substance abuse. Individual and group counselling available at YRC.`,
      startSlaDays: 50,
      slaDays: 90,
      checklist: [
        { text: "Design 2-day capacity-building workshop curriculum for youth" },
        { text: "Conduct first 2-day workshop — health, hygiene, reproductive health, nutrition" },
        { text: "Set up monthly session calendar: mental health, legal literacy, financial literacy, digital literacy" },
        { text: "Set up monthly session calendar: constitutional values, substance abuse, career counselling, SRHR" },
        { text: "Schedule quarterly Yuva Adda (gender equality, GBV, constitution, caste, pluralism, environment)" },
        { text: "Set up individual counselling availability at YRC (youth worker + referral when needed)" },
        { text: "Set up group counselling for identified at-risk youth" },
        { text: "Populate YRC information bank with brochures, scheme helplines, and reference materials" },
        { text: "Plan first youth festival / cultural programme" },
        { text: "Raise POCSO awareness in the community" },
      ],
    },
    {
      title: "Documentation & Scheme Linkage Drive",
      type: "Milestone",
      notes: `Facilitate access to identity documents and entitlements for all enrolled youth. Map each youth's documentation gaps from the baseline survey. Then facilitate applications for scholarships, skill training, and higher education. Youth workers dedicate time monthly to department visits and follow-up. Key schemes: post-matric scholarships, BBMP fee reimbursement (Shulka Marupavathi), Yuva Spandana, APF scholarship, NYK registration.`,
      startSlaDays: 45,
      slaDays: 90,
      checklist: [
        { text: "Review baseline documentation gaps per youth: Aadhaar, voter ID, bank account, ration card, caste/income certificate" },
        { text: "Organise documentation camps to address gaps in bulk" },
        { text: "Register eligible youth with Nehru Yuva Kendra (NYK)" },
        { text: "Facilitate post-matric scholarship applications (SC/ST, minority, general)" },
        { text: "Facilitate BBMP fee reimbursement (Shulka Marupavathi) for eligible students" },
        { text: "Facilitate Yuva Spandana scheme registration" },
        { text: "Facilitate APF scholarship applications where applicable" },
        { text: "Facilitate skill training enrolment (NSDC, state skill missions, NGO programmes)" },
        { text: "Facilitate college referral and preparation for interested youth" },
        { text: "Set up monthly department visit rhythm — youth workers dedicated days for follow-up" },
        { text: "Track scheme application status per youth in MIS" },
      ],
    },
    {
      title: "Youth Leadership Programme",
      type: "Training",
      notes: `Develop ${youthLeaders} youth leaders (20 per worker across ${yrcs} YRC(s)) through structured leadership training, action research, and peer mentoring. These youth will eventually become community mentors and potential youth workers. Leadership activities begin once YRC has decent regular footfall — typically after 3–4 months.`,
      startSlaDays: 60,
      slaDays: 110,
      checklist: [
        { text: `Confirm ${youthLeaders} youth as leadership cohort (20 per worker)` },
        { text: "Conduct leadership orientation: community development, rights, documentation, gender" },
        { text: "Assign action research: assess functioning of a public institution (PHC, school, ration shop, SDMC)" },
        { text: "Support youth in documenting findings and drafting recommendations" },
        { text: "Facilitate youth-led presentation to relevant department official" },
        { text: "Identify 1–2 youth per YRC as potential future youth workers/mentors" },
        { text: "Coach youth leaders: scholarship support for peers, sports coaching, academic peer support" },
        { text: "Plan and conduct exposure visit for youth leaders" },
        { text: "Felicitate outstanding leaders at annual youth festival" },
        { text: "Track leadership engagement and community action in MIS" },
      ],
    },
    {
      title: "Youth-Led Social Action Programme",
      type: "Milestone",
      notes: `Social action begins after 6–8 months of preparatory work (enlisting, campaigns, decent YRC footfall). Youth are split into groups of 5. Each worker is responsible for 5–10 social action programmes. Categories: crisis intervention (child marriage, trafficking, GBV), community building (street plays, wall paintings, events), youth cadre (sports coaching, scholarship support), and community work (re-enrolment, scheme advocacy, institution improvement).`,
      startSlaDays: 180,
      slaDays: 240,
      checklist: [
        { text: "Confirm YRC readiness: 6–8 months of operations, decent footfall, enrolled leadership cohort" },
        { text: "Divide active youth into action groups of 5" },
        { text: "Each worker identifies 5–10 social action programmes from the categories below" },
        { text: "Crisis intervention actions: identify and escalate child marriage, trafficking signs, GBV cases" },
        { text: "Crisis intervention: accompany survivors to police/court; serve as witnesses; first responder for GBV" },
        { text: "Community building: street plays, wall paintings, film screenings, inter-faith celebrations" },
        { text: "Youth cadre: coach younger children in sports; support peers in scholarship and job applications" },
        { text: "Community work: re-enrol dropout students; support younger students academically; peer counselling" },
        { text: "Community work: ensure menstrual product access; lead tree plantation drives; organise health camps" },
        { text: "Community work: review school/SDMC/PHC functioning → take action (meetings, escalations, appeals)" },
        { text: "Community work: conduct welfare scheme surveys (PDS, pensions, UDID, caste certificates)" },
        { text: "Community work: organise lok adalats/Jan Sunwai if entitlements are denied" },
        { text: "Document outcomes of each social action programme in MIS" },
      ],
    },
    {
      title: "Crisis Intervention & Referral System",
      type: "Milestone",
      notes: `Establish a functioning support system for youth in crisis — substance abuse, GBV, early pregnancy, undertrial cases. Referral pathways to NIMHANS, psychologists, legal aid, and shelter services. Peer-to-peer support groups. Youth workers proactively identify at-risk youth from enumeration data and ongoing engagement.`,
      startSlaDays: 45,
      slaDays: 75,
      checklist: [
        { text: "Map crisis referral services: NIMHANS, psychologists, legal aid, shelter, DV helplines, police" },
        { text: "Establish referral pathway for substance abuse (counselling → professional care → follow-up)" },
        { text: "Establish referral pathway for GBV / domestic violence (safe reporting → police → legal aid)" },
        { text: "Establish referral pathway for undertrial/legal cases (legal aid, court accompaniment)" },
        { text: "Establish referral pathway for potential child marriage (identify → escalate → intervene)" },
        { text: "Identify early trafficking signs and escalate to NGO/police" },
        { text: "Set up peer-to-peer support group at each YRC" },
        { text: "Train youth workers on basic counselling, crisis de-escalation, and when to refer" },
        { text: "Identify at-risk youth from enumeration and initiate individual engagement plan" },
        { text: "Track crisis cases in MIS: type, referral made, follow-up status, outcome" },
      ],
    },
    {
      title: "MIS Setup & Monitoring Cadence",
      type: "Milestone",
      notes: `Operationalise the Youth MIS. Key metrics: new youth at YRC, youth reached, sessions conducted vs planned, avg attendance, individual support facilitated, referrals made/successful, youth in multiple activities, community activity conducted vs planned. Monitoring: YRC Coordinator oversees workers daily; Youth Lead visits weekly (half-day at YRC + half-day with workers in field); Foundation RP visits all YRCs monthly; monthly review of all coordinators and workers by Youth Lead; monthly meeting of all Youth Leads by Foundation RP.`,
      startSlaDays: 35,
      slaDays: 60,
      checklist: [
        { text: "Set up MIS — enrol all enumerated youth with baseline data" },
        { text: "Configure: YRC daily attendance, session attendance, group meeting attendance" },
        { text: "Configure: youth visited repeatedly (>2 times/month) tracker" },
        { text: "Configure: scheme and documentation tracker (status per youth)" },
        { text: "Configure: social action tracker (programme type, participants, outcome)" },
        { text: "Configure: crisis/referral tracker (type, referral, follow-up, outcome)" },
        { text: "Configure: leadership programme tracker (cohort, activities, status)" },
        { text: "Configure programme-level metrics: sessions planned vs conducted, avg attendance, referrals made vs successful" },
        ...(hasYouthLead ? [{ text: "Set Youth Lead weekly visit schedule (half-day YRC + half-day with workers in field)" }] : []),
        { text: "Set Foundation RP monthly visit schedule to all YRCs (handholding + review)" },
        { text: "Set monthly review meeting: all YRC coordinators + youth workers, led by Youth Lead" },
        { text: "Set monthly meeting of all Youth Leads by Foundation RP" },
        { text: "Conduct first monthly review — document learnings from preparation and early engagement" },
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
  {
    id: "children-learning-centre",
    name: "Children Learning Centre",
    description: "Setup and operations for Children Learning Centres (CLC) serving children aged 4–14. Covers team recruitment, centre setup, children survey & baseline, staff training, daily operations, school linkage, life skills programme, and MIS.",
    category: "Community Programs",
    icon: "📚",
    parameters: [
      {
        key: "centres",
        label: "Number of centres",
        type: "number",
        min: 1,
        max: 50,
        placeholder: "e.g. 2 (each serving ~100 children)",
      },
    ],
    build: buildChildrenTemplate,
  },
  {
    id: "youth-resource-centre",
    name: "Youth Resource Centre",
    description: "Setup and operations for Youth Resource Centres (YRC) serving youth aged 15–21. Covers team recruitment, YRC setup, enumeration & baseline, group mobilisation, capacity building, scheme linkage, leadership programme, social actions, and crisis support.",
    category: "Community Programs",
    icon: "🌱",
    parameters: [
      {
        key: "clusters",
        label: "Number of clusters",
        type: "number",
        min: 1,
        max: 20,
        placeholder: "e.g. 2 (each ~500–600 youth, 1 YRC per cluster)",
      },
    ],
    build: buildYouthTemplate,
  },
];

export function getTemplate(id: string): GoalTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
