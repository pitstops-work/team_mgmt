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
  recurrence?: "None" | "Weekly" | "Monthly" | "Quarterly";
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
        { text: "Recruit Programme Manager (1 overall)" },
        { text: `Recruit ${clusters} Cluster Coordinator(s) (1 per cluster)` },
        { text: `Recruit ${clusters} Resource Centre Coordinator(s) (1 per cluster RCC)` },
        { text: "Recruit MIS Coordinator (1 overall)" },
        { text: `Recruit ${totalCOs} Community Organizers (2 per cluster, from community)` },
        { text: "Conduct team induction and orientation session" },
        { text: "Map existing COs — assess interests, capacity, entitlement experience, stakeholder relationships" },
        { text: "Assign COs to clusters and settlements" },
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
        { text: "Draft JD and initiate hiring for 2 seeding programme support roles" },
        { text: "Identify interim support from existing team while hires are in progress" },
        { text: "Set up weekly Friday 9am tracking meeting (programme leads)" },
        { text: "Define roles: who holds sourcing/screening centrally vs geo-level handholding" },
        { text: "Set up shared tracking sheet / MIS for seeding pipeline" },
        { text: "Onboard new hires and orient them on the seeding approach and categories" },
      ],
    },
    {
      title: "Geo Demand Estimation",
      type: "Milestone",
      notes: `Engage each Geo team to understand where and what type of seeding is needed. Output: a demand map per geography — thematic priorities, preferred candidate profiles, and readiness to handhold. This demand map drives the sourcing framework. Without it, sourcing risks being supply-led and misaligned.`,
      startSlaDays: 7,
      slaDays: 45,
      checklist: [
        { text: "Design demand estimation questionnaire for Geo teams" },
        { text: "Meet each Geo team lead — understand thematic gaps and expansion priorities" },
        { text: "Identify programmatic domains with clarity and frameworks (e.g. livelihoods, creches)" },
        { text: "Identify geographies where seeding is a priority in the near term" },
        { text: "Understand Geo team capacity to handhold a seeded organisation (bandwidth, experience)" },
        { text: "Compile demand map: geography × theme × preferred candidate type" },
        { text: "Share demand map with programme leads for alignment" },
      ],
    },
    {
      title: "Learning from Peer Seeding Institutions",
      type: "Meeting",
      notes: `Engage 3–5 institutions that do seeding or incubation work in the social sector to learn from their experience — what worked, what didn't, how they structure cohorts, what support is most valued, and common failure modes. This informs our model design before we commit to an approach.`,
      startSlaDays: 7,
      slaDays: 45,
      checklist: [
        { text: "Identify 3–5 peer institutions doing seeding/incubation (social sector)" },
        { text: "Prepare structured learning questions: sourcing, screening, support model, failure modes" },
        { text: "Conduct conversations with each institution — take structured notes" },
        { text: "Understand how they differentiate between categories (freshers vs alumni vs young orgs)" },
        { text: "Understand their capacity-building approach and what worked" },
        { text: "Understand how they manage the 'thin line' between over-involvement and under-support" },
        { text: "Synthesise learnings into a 1-page note for internal discussion" },
      ],
    },
    {
      title: "Sourcing Framework Development",
      type: "Milestone",
      notes: `Develop the sourcing framework covering all 5 candidate categories: (A) freshers from social work colleges, (B) alumni in CSOs / partner orgs, (C) youth leaders already engaged in communities, (D) young organisations not yet grown, (E) alumni from non-social-work institutions. Each category has a different sourcing channel, screening lens, and mode of engagement. Framework must link to the geo demand map.`,
      startSlaDays: 30,
      slaDays: 60,
      checklist: [
        { text: "Draft sourcing channels per category (A–E) — colleges, networks, partner orgs, communities" },
        { text: "Define screening criteria per category — what does 'potential' look like for each?" },
        { text: "Define mode of engagement per category — internship, seed fund, early-stage grant, etc." },
        { text: "Define 12–18 month pathway for Category A (freshers): intern → incubation → seed-stage" },
        { text: "Define 12–18 month pathway for Category B/C: seed fund → early-stage grant" },
        { text: "Revisit Category D (young orgs) — current experience weak; identify revised support structure" },
        { text: "Set priority order across categories (Category E is last priority currently)" },
        { text: "Link sourcing targets to geo demand map — which categories for which geographies?" },
        { text: "Share draft framework with Geo teams for feedback" },
        { text: "Finalise framework — document and circulate to all stakeholders" },
      ],
    },
    {
      title: "Capacity Building Approach Decision",
      type: "Meeting",
      notes: `Decide how capacity building support will be structured for seeded organisations. Three options discussed: (1) through the URC, (2) through mentor organisations, (3) through dedicated teams in Geo teams. These are not mutually exclusive. Decision should factor in cost, quality, proximity to the seeded org, and Geo team bandwidth.`,
      startSlaDays: 30,
      slaDays: 60,
      checklist: [
        { text: "Map current URC capacity and willingness to support seeded organisations" },
        { text: "Identify potential mentor organisations per geography/theme" },
        { text: "Assess Geo team bandwidth for dedicated handholding" },
        { text: "Present options and tradeoffs to programme leadership for decision" },
        { text: "Draft capacity building plan for the first cohort based on chosen approach" },
        { text: "Document decision and rationale — share with Geo teams" },
      ],
    },
    {
      title: "Sourcing & Screening — Build Pipeline",
      type: "Milestone",
      notes: `Activate sourcing channels and build a pipeline of ${cohort * 4}–${cohort * 6} candidates (targeting a ${cohort}-person/org cohort, assuming ~4–6× funnel). Sourcing and screening are held centrally. Geo teams are consulted on fit with local demand. Screening distinguishes genuine motivation and potential from surface interest.`,
      startSlaDays: 45,
      slaDays: 90,
      checklist: [
        { text: "Activate sourcing channels per category — reach out to colleges, networks, partner orgs" },
        { text: `Build initial pipeline of ${cohort * 4}–${cohort * 6} candidates across categories` },
        { text: "Design screening process: application, conversation, reference check" },
        { text: "Conduct first-round screening conversations with all applicants" },
        { text: "Involve Geo teams in assessing fit with local demand and context" },
        { text: "Shortlist candidates — document rationale per shortlisted person/org" },
        { text: "Conduct deeper assessment for shortlisted candidates (second conversation / field visit)" },
        { text: `Finalise cohort of ${cohort} candidates — document selection rationale` },
      ],
    },
    {
      title: "Cohort Onboarding & Placement",
      type: "Milestone",
      notes: `Onboard the first seeding cohort. Category A (freshers): place as interns with partner organisations for 12–18 months. Category B/C (alumni/youth leaders): typically placed in home states/districts with a 12–18 month seed fund, followed by early-stage grant. Each seeded individual/org gets a designated Geo team contact for handholding. Balance between over-involvement and under-support is critical.`,
      startSlaDays: 75,
      slaDays: 120,
      checklist: [
        { text: "Confirm placement details with each cohort member — host org (if intern) or geography (if seeding)" },
        { text: "Issue seed fund agreements / internship letters as applicable" },
        { text: "Assign Geo team contact per cohort member for handholding" },
        { text: "Conduct onboarding orientation — explain expectations, support available, review cadence" },
        { text: "Set up 12–18 month engagement calendar for each cohort member" },
        { text: "Define what 'progress' looks like at 3, 6, 12 months for each cohort member" },
        { text: "Introduce cohort members to each other — enable peer learning" },
        { text: "Document cohort baseline: motivation, skills, context, stated goals" },
      ],
    },
    {
      title: "Review & Monitoring Cadence",
      type: "Milestone",
      notes: `Establish a structured review rhythm to track progress without over-controlling. Weekly Friday meeting tracks operational progress. Quarterly review assesses cohort progress at a deeper level. Seeded orgs/individuals should feel supported but not suffocated — the review process should be light-touch and developmental rather than compliance-oriented.`,
      startSlaDays: 14,
      slaDays: 90,
      checklist: [
        { text: "Weekly Friday 9am check-in: pipeline status, blockers, decisions needed" },
        { text: "Set up cohort tracking tracker: status per member, support given, milestones hit" },
        { text: "Monthly check-in with each cohort member (Geo team lead)" },
        { text: "Quarterly programme review: cohort progress, framework learnings, adjustments needed" },
        { text: "Define early warning indicators — what signals a cohort member is struggling?" },
        { text: "Define exit/graduation criteria — when is a seeded org ready for the next stage?" },
        { text: "Document learnings after first cohort — inform second cohort design" },
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
        { text: "Assign Programme Manager (1 overall)" },
        { text: `Assign ${cos} Community Organiser(s) (1 per 625 HH)` },
        { text: `Assign ${acs} Area Coordinator(s) (1 per 3–4 COs)` },
        { text: `Assign ${rccs} Resource Centre Coordinator(s) (1 per RCC)` },
        { text: "Assign MIS Coordinator (1 overall)" },
        { text: "Conduct 3-day induction: scheme eligibility, document checklist, application process" },
        { text: "Train on CMCHIS / PMJAY: eligibility (income <₹72k/year), docs (Aadhaar + Income cert), 1467 empanelled hospitals" },
        { text: "Train on PMJJBY: ₹2L life insurance @₹436/year, needs bank account, age 18–50" },
        { text: "Train on PMSBY: ₹2L accident insurance @₹20/year, needs bank account, age 18–70" },
        { text: "Train on APY: pension ₹1k–5k/month on retirement, age 18–40, bank account needed" },
        { text: "Train on state welfare pensions: old age (60+), widow, disability (UDID required)" },
        { text: "Train on PMAY: housing subsidy for homeless/kachha house, Aadhaar + income cert + land doc" },
        { text: "Train on NFSA / ration card: PHH (5 kg/person @₹3/kg), AAY for destitute" },
        { text: "Train on Jan Dhan: zero-balance account, RuPay card, Aadhaar seeding for DBT" },
        { text: "Identify and note key government contacts per scheme: taluk office, CMCHIS help desk, bank BC agent" },
        { text: "Set up team WhatsApp group for daily updates and issue escalation" },
      ],
    },
    {
      title: "Settlement Mapping & Household Linelisting",
      type: "Milestone",
      notes: `Build a complete household register for the settlement. Sketch or GPS-map each street/lane. Enumerate every household: head name, family members (name/age/gender), address, and contact number. This linelist is the foundation of all subsequent scheme-tracking work.`,
      startSlaDays: 7,
      slaDays: 35,
      checklist: [
        { text: "Prepare or verify settlement map — identify all streets/lanes/blocks" },
        { text: "Assign streets to each CO for systematic door-to-door coverage" },
        { text: "Enumerate all households: head of household name, address, mobile number" },
        { text: "List all family members: name, age, gender, relationship to head" },
        { text: "Note if household is tenant or owner; approximate house structure (pucca/kachha/kutcha)" },
        { text: "Flag vulnerable households: elderly (60+) living alone, widows, PwD, single women HH, destitute" },
        { text: "Enter all households into MIS (Frappe / field app)" },
        { text: "Review coverage — ensure no street/lane missed; verify count against any existing community data" },
        { text: `Confirm final linelist count against target (${hh} HH)` },
      ],
    },
    {
      title: "Baseline Entitlement Survey",
      type: "Milestone",
      notes: `Survey every household to map current entitlement status and document gaps. Per-household fields: CMCHIS/PMJAY status, ration card type (AAY/PHH/SPHH/none), Jan Dhan bank account, social security schemes enrolled (PMJJBY/PMSBY/APY), pension status, housing type, voter ID status, and which Aadhaar/income/caste certificates are present. This drives scheme-wise priority lists in the MIS.`,
      startSlaDays: 21,
      slaDays: 50,
      checklist: [
        { text: "Design or finalise baseline survey form — cover all schemes and document fields" },
        { text: "Conduct survey for all listed households (attach to existing linelist records)" },
        { text: "Record per HH: ration card number and type (AAY / PHH / SPHH / none)" },
        { text: "Record per HH: CMCHIS / PMJAY status (Active / Applied / Not Applied)" },
        { text: "Record per individual: Jan Dhan or bank account (Yes/No), account number if yes" },
        { text: "Record per individual: PMJJBY enrolled (Y/N), PMSBY enrolled (Y/N), APY enrolled (Y/N)" },
        { text: "Record per eligible elderly/widow/PwD: pension status and pension amount if receiving" },
        { text: "Record per individual: voter ID present (Y/N), correct address (Y/N)" },
        { text: "Record per HH: house type (pucca/semi-pucca/kachha) — flag kachha/homeless for PMAY" },
        { text: "Record per individual: Aadhaar present (Y/N), mobile seeded (Y/N), name/DOB correct (Y/N)" },
        { text: "Record per individual: income certificate present (Y/N), date of issue" },
        { text: "Record per individual: caste/community certificate present (Y/N) where applicable" },
        { text: "Update MIS with survey data; generate scheme-wise gap reports" },
        { text: "Brief Area Coordinators on household priority lists per scheme" },
      ],
    },
    {
      title: "Document Foundation Drive (Aadhaar, Income Cert, Ration Card, Jan Dhan)",
      type: "Milestone",
      notes: `Documents are the common bottleneck across all schemes. Prioritise this before scheme-specific drives. Key work: Aadhaar corrections and mobile seeding, Income Certificate applications and renewals (4-day ETA at TN taluk offices), Ration Card family member updates, Jan Dhan zero-balance account opening. Run document camps to batch-process multiple households in a day.`,
      startSlaDays: 35,
      slaDays: 80,
      checklist: [
        { text: "Identify households with Aadhaar gaps from baseline — missing, incorrect name/DOB, mobile not seeded" },
        { text: "Organise Aadhaar correction/enrollment camp or schedule CO-accompanied trips to Aadhaar centre" },
        { text: "Seed mobile number to Aadhaar for DBT linkage (UIDAI portal or Aadhaar centre)" },
        { text: "Identify households needing Income Certificate (new application or renewal/expired)" },
        { text: "Batch-apply Income Certificates at taluk office — track ETA (typically 4 days)" },
        { text: "Follow up on pending Income Certs — escalate delays beyond 10 days to supervisor" },
        { text: "Flag expired Income Certs — re-apply immediately (blocks CMCHIS)" },
        { text: "Review ration cards — identify non-members, newborns, new members needing addition" },
        { text: "Support ration card family member additions at TNPDS / PDS office" },
        { text: "Identify households with AAY eligibility not yet upgraded from PHH — support reclassification" },
        { text: "Identify adults without Jan Dhan/bank account; coordinate with nearest bank BC agent or branch" },
        { text: "Open zero-balance Jan Dhan accounts; ensure RuPay debit card issued" },
        { text: "Link Aadhaar to bank account for DBT (required for pension, PMAY, PMJJBY/PMSBY auto-debit)" },
        { text: "Track document status per household/individual in MIS — update after each completion" },
      ],
    },
    {
      title: "Health Insurance Enrollment Drive (CMCHIS / PMJAY)",
      type: "Milestone",
      notes: `Primary health insurance enrollment for all eligible households. CMCHIS (TN): ₹5 lakh/year per family, requires Aadhaar + Income Cert (income <₹72,000/year), 1,467 empanelled hospitals. PMJAY (Ayushman Bharat): ₹5 lakh/year for SECC-listed households — check beneficiary status on PMJAY portal. Run CO daily plan (30 HH/day) prioritising doc-ready households. Track: not applied → applied → active; rejected → re-applied.`,
      startSlaDays: 50,
      slaDays: 100,
      checklist: [
        { text: "Generate MIS list: households with Aadhaar Received AND Income Cert Received — highest priority" },
        { text: "Run CO daily plan (30 HH/day) starting with doc-ready households" },
        { text: "Accompany or guide HH head to nearest CMCHIS enrollment centre with documents" },
        { text: "Check PMJAY beneficiary status for each HH on pmjay.gov.in — eligible HH enrolled directly" },
        { text: "Record CMCHIS / PMJAY application number and expected activation date in MIS" },
        { text: "Follow up on Applied HH after 5-day ETA — check activation status" },
        { text: "Investigate rejected cases: reason for rejection (income limit, name mismatch, duplicate)" },
        { text: "Correct docs for rejected cases and re-apply — track as second application in MIS" },
        { text: "Inform activated families: how to use card, nearest empanelled hospitals, cashless process" },
        { text: "Notify Aadhaar-pending and Income-cert-pending HH of their blocking item — route to Document Drive" },
        { text: "Track overall pipeline: Not Applied / Docs Pending / Applied / Active / Rejected" },
      ],
    },
    {
      title: "Social Security Scheme Drive (PMJJBY / PMSBY / APY)",
      type: "Milestone",
      notes: `Bank-account-linked social security for individuals — best enrolled in a camp with bank BC agent. PMJJBY: ₹2L life insurance @₹436/year auto-debited, age 18–50, bank account needed. PMSBY: ₹2L accident insurance @₹20/year, age 18–70, bank account needed. APY: state pension ₹1k–5k/month on retirement based on contribution, age 18–40, bank account needed. These are individual-level enrollments — target every eligible adult.`,
      startSlaDays: 70,
      slaDays: 120,
      checklist: [
        { text: "Generate MIS list: adults aged 18–50 with bank account but not enrolled in PMJJBY" },
        { text: "Generate MIS list: adults aged 18–70 with bank account but not enrolled in PMSBY" },
        { text: "Generate MIS list: adults aged 18–40 in informal sector — APY candidates" },
        { text: "Coordinate with nearest bank BC agent or branch to run enrollment camp in the settlement" },
        { text: "Enroll eligible adults in PMJJBY — fill nomination form, confirm auto-debit set up" },
        { text: "Enroll eligible adults in PMSBY — same session, ₹20/year, confirm auto-debit" },
        { text: "Enroll interested youth/adults in APY — explain contribution tiers (₹42–₹291/month) and pension amounts" },
        { text: "Update MIS: PMJJBY enrolled (Y/N), PMSBY enrolled (Y/N), APY enrolled (Y/N) per individual" },
        { text: "Brief families: what PMJJBY covers (death/natural cause), claim process, nominee importance" },
        { text: "Brief families: what PMSBY covers (accident death + disability), claim process" },
        { text: "Follow up: confirm bank statements show first auto-debit for PMJJBY/PMSBY" },
      ],
    },
    {
      title: "Welfare Pension & Disability Entitlements Drive",
      type: "Milestone",
      notes: `State and central pension schemes for elderly, widows, and persons with disability. Old Age Pension (TN IGNOAPS): ₹1,000/month for age 60+, income-poor households — apply at Village Administrative Officer (VAO) or Taluk office. Widow Pension (IGNWPS): ₹1,000/month, apply similarly. UDID (Unique Disability ID): national disability card enabling reservations, travel concessions, scheme access — requires govt medical board assessment.`,
      startSlaDays: 70,
      slaDays: 130,
      checklist: [
        { text: "Identify elderly (60+) not receiving any pension from baseline survey" },
        { text: "Verify income eligibility — old age pension targets landless, income-poor HH" },
        { text: "Support application at Taluk office / VAO: Aadhaar, bank passbook, age proof, income cert" },
        { text: "Identify widows not receiving widow pension — support IGNWPS application" },
        { text: "Track pension applications: submitted → approved → first payment received in MIS" },
        { text: "Identify PwD (persons with disability) from baseline — confirm disability type" },
        { text: "Support visit to nearest govt hospital for disability certificate / medical board assessment" },
        { text: "Facilitate UDID card enrollment at udid.gov.in after disability certificate issued" },
        { text: "Identify PwD with UDID eligible for disability pension — apply at Taluk office" },
        { text: "Brief families on UDID benefits: reservations, concessional travel, PDS priority, scheme access" },
        { text: "Update MIS: pension status (not applied / applied / approved / receiving) per individual" },
      ],
    },
    {
      title: "Housing, Voter ID & Civic Entitlements Drive",
      type: "Milestone",
      notes: `PMAY (Pradhan Mantri Awas Yojana): ₹1.2–2.5L subsidy for homeless or kachha-house families — Aadhaar, income cert, land document needed; apply at panchayat/municipality. Voter ID: enroll unregistered adults (Form 6 at BLO or online on voters.eci.gov.in). Property/Patta: support where settlement has been regularised. Civic gaps (water, sanitation, street lights) — coordinate with WRP/Welfare Rights team for systemic follow-up.`,
      startSlaDays: 90,
      slaDays: 150,
      checklist: [
        { text: "Identify households in kachha/kutcha house or homeless from baseline — flag for PMAY" },
        { text: "Check if settlement appears in PMAY beneficiary list (AwaasSoft portal or municipality)" },
        { text: "Support PMAY application: Aadhaar, income cert, photo, bank account, land/possession document" },
        { text: "Track PMAY applications: applied → approved → construction linked payment (CLP)" },
        { text: "Identify adults without voter ID or with wrong address — support Form 6 or correction application" },
        { text: "Conduct voter ID enrollment/correction camp (or schedule BLO visit to settlement)" },
        { text: "Track voter ID status per adult in MIS (not enrolled / applied / received)" },
        { text: "Identify households without piped water connection — document and hand over to civic action team" },
        { text: "Identify households without individual toilet / open defecation — SBM linkage if settlement eligible" },
        { text: "Identify streets without street lights / road repair needs — escalate to Ward Councillor / municipality" },
        { text: "Update MIS: PMAY status, voter ID status, civic gap flags per household" },
      ],
    },
    {
      title: "Ongoing Followup & Pipeline Tracking",
      type: "Milestone",
      notes: `Continuous CO-led household followup driven by MIS priority lists — same model as CMCHIS daily work plan (30 HH/day per CO, pool-based prioritisation). Priority pools: (1) households with zero scheme coverage, (2) households with docs ready but applications pending, (3) households with overdue follow-up / pending status, (4) recently activated — check experience and address issues. Refresh MIS after each visit.`,
      startSlaDays: 50,
      slaDays: 180,
      checklist: [
        { text: "Set up MIS daily plan generation — pools based on scheme coverage gaps and doc readiness" },
        { text: "Confirm COs running 30 HH visits/day per daily plan" },
        { text: "Weekly review: % households with CMCHIS active, PMJJBY, PMSBY, APY enrolled" },
        { text: "Weekly review: income cert pipeline — pending, applied, received, expired" },
        { text: "Weekly review: Aadhaar pipeline — missing, correction pending, received" },
        { text: "Track rejection rate per scheme — investigate if >10% rejections for any scheme" },
        { text: "Track households with zero scheme coverage — these are highest priority" },
        { text: "Ensure newborns, new migrants, and newly-identified HH are onboarded to MIS" },
        { text: "Handle mid-year Income Cert expiry — re-apply before CMCHIS renewal deadline" },
        { text: "Monthly Area Coordinator review: scheme-wise pipeline, CO coverage rate, blockers" },
      ],
    },
    {
      title: "Community Review & Grievance Redressal",
      type: "Meeting",
      notes: `Monthly community meetings to share entitlement progress and collect grievances. Grievance types: scheme denial without valid reason, corruption/bribery at government offices, application delays beyond SLA, wrong rejection (name mismatch, manual error). Escalation path: verbal → written complaint → senior official → RTI. Jan Sunwai (public hearing) for systemic denial affecting many households.`,
      startSlaDays: 60,
      slaDays: 180,
      checklist: [
        { text: "Schedule monthly community meeting — share scheme enrollment numbers and pending list" },
        { text: "Collect grievances: households denied schemes, bribery demands, application delays" },
        { text: "Categorise grievances: individual (name mismatch, doc issue) vs systemic (policy/process gap)" },
        { text: "Resolve individual cases: write application to concerned officer with supporting docs" },
        { text: "Escalate systemic issues to District Officer / Collector with documented evidence" },
        { text: "Track grievance status in MIS: raised → escalated → resolved" },
        { text: "File RTI application for scheme-specific denial data if systemic pattern identified" },
        { text: "Organise Jan Sunwai (public hearing) if large number of HH denied same scheme" },
        { text: "Document success stories — households that received CMCHIS and actually used it at hospital" },
        { text: "Share quarterly progress report with programme leadership: scheme coverage %, pending, grievances" },
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
        max: 1000000,
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
        max: 1000000,
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
        max: 1000000,
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
        max: 1000000,
        placeholder: "e.g. 2 (each ~500–600 youth, 1 YRC per cluster)",
      },
    ],
    build: buildYouthTemplate,
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
    build: buildSeedingTemplate,
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
        { title: `WR: Community Group Meeting — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly meeting with all community groups at cluster level. Review WR cases, escalations, and organizer progress.", checklist: [{ text: "Pre-meeting agenda circulated to partner" }, { text: "All slum community groups represented" }, { text: "Active WR cases reviewed" }, { text: "Issues and escalations documented" }, { text: "Follow-up action owners assigned" }, { text: "Meeting notes shared with partner" }] },
        { title: `WR: Partner Review Meeting — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with partner team (cluster coordinator + COs). Progress on pending cases, priorities for next month.", checklist: [{ text: "Cluster coordinator and all COs present" }, { text: "Previous month action items reviewed" }, { text: "Pending WR cases status updated" }, { text: "MIS data cross-checked with field reality" }, { text: "Next month priorities agreed" }] },
        { title: `WR: Rights Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly training on civic amenities, land & housing rights, welfare schemes. Topics rotate each month.", checklist: [{ text: "Training topic selected (civic amenities / land / housing / scheme)" }, { text: "Training material prepared" }, { text: "All COs and coordinator attended" }, { text: "Practice / role-play conducted" }, { text: "Attendance recorded" }, { text: "Follow-up material distributed" }] },
        // CHILDREN
        { title: `Children: Centre Visit (Twice-Weekly) — ${cluster}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Visit the children's centre twice a week (½ day each). Handhold coordinator in planned activities and quality review.", checklist: [{ text: "Centre activity for the day observed" }, { text: "Coordinator supported on planned activity" }, { text: "Attendance register reviewed" }, { text: "Learning quality spot-check done" }, { text: "Infrastructure / material needs flagged" }, { text: "Coordinator debrief completed" }] },
        { title: `Children: Monthly Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly training for children's programme activities. Reinforce with coordinator post-session.", checklist: [{ text: "Training topic aligned with monthly plan" }, { text: "Full session attended" }, { text: "Key learning shared with coordinator" }, { text: "Attendance recorded" }] },
        { title: `Children: Govt School / DI Coordination — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Visit relevant government schools and coordinate with DI on dropout follow-up and school-community engagement.", checklist: [{ text: "Target school(s) visited / DI contacted" }, { text: "Out-of-school children list updated" }, { text: "Dropout follow-up done with partner" }, { text: "School engagement plan progressed" }, { text: "Next steps documented" }] },
        // YOUTH
        { title: `Youth: Saturday Centre Visit + CAP Review — ${cluster}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Every Saturday: visit youth resource centre and review CAP progress with youth groups (½ day/week).", checklist: [{ text: "Youth centre visited" }, { text: "Coordinator supported" }, { text: "Youth groups met for CAP review" }, { text: "CAP milestones status updated" }, { text: "Blockers / issues logged" }, { text: "Wins noted for motivation" }] },
        { title: `Youth: Monthly Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly youth programme training. Brief coordinator on key takeaways.", checklist: [{ text: "Training topic aligned with monthly plan" }, { text: "Full session attended" }, { text: "Coordinator briefed post-training" }, { text: "Attendance recorded" }] },
        // ELDERLY
        { title: `Elderly: Monthly Centre and Outreach Review — ${cluster}`, type: "Review", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review of elderly care centre operations and outreach coverage.", checklist: [{ text: "Centre visited and operations observed" }, { text: "Outreach coverage vs. target reviewed" }, { text: "Caregiver welfare checked" }, { text: "Health referral cases followed up" }, { text: "Issues escalated with action owners" }] },
        { title: `Elderly: Monthly Team Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly training for full elderly care team (coordinator, helpers, outreach workers, part-time therapists).", checklist: [{ text: "Training topic prepared" }, { text: "All staff attended" }, { text: "Practical demonstration included" }, { text: "Action points documented" }] },
        { title: `Elderly: Field Day with COs — ${cluster}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "One full day each with CO-1 and CO-2 on the field. Observe work, provide coaching. 2 days/month total.", checklist: [{ text: "Field day with CO-1 completed" }, { text: "Field day with CO-2 completed" }, { text: "Field observations documented for both" }, { text: "Coaching and support provided" }] },
        { title: `Elderly: CSO Referral Mapping — ${cluster}`, type: "Research", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Map local CSOs and govt services for elderly referrals. Establish active referral relationships.", checklist: [{ text: "CSOs / govt services identified" }, { text: "At least 2 new referral contacts established" }, { text: "Referral directory updated and shared" }, { text: "At least 1 successful referral completed and documented" }] },
        // CRECHES
        { title: `Creche: Monthly Rounds (${n} creches) — ${cluster}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: `Monthly 2-hour visit to each of the ${n} creches in the cluster (~3 days/month).`, checklist: [{ text: `All ${n} creches visited this month` }, { text: "Caregiver conduct observed in each creche" }, { text: "Child nutrition records reviewed" }, { text: "Hygiene and safety standards checked" }, { text: "Issues flagged to supervisor immediately" }, { text: "Creche visit log updated" }] },
        { title: `Creche: Supervisor Review — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with creche supervisors. Quality concerns, caregiver issues, expansion pipeline.", checklist: [{ text: "Both supervisors attended" }, { text: "Monthly rounds findings discussed" }, { text: "Caregiver performance issues addressed" }, { text: "Expansion / new creche pipeline reviewed" }, { text: "Action items documented" }] },
        // TEAM & ADMIN
        { title: "City / Zonal Team Review", type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly city-level or zonal RP team review. Present cluster updates and cross-learn.", checklist: [{ text: "Attended city / zonal team review" }, { text: "Cluster update presented" }, { text: "Cross-learning shared with team" }, { text: "Systemic issues flagged to PM" }, { text: "Action items noted" }] },
        { title: "Quarterly Report and Programme Review", type: "Review", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Quarterly report covering all programme domains. Data, analysis, challenges, learnings, and next quarter plan.", checklist: [{ text: "WR data compiled" }, { text: "Children programme data compiled" }, { text: "Youth programme data compiled" }, { text: "Elderly programme data compiled" }, { text: "Creche programme data compiled" }, { text: "Partner inputs received" }, { text: "Challenges and learnings written" }, { text: "Next quarter priorities drafted" }, { text: "Report reviewed with PM" }, { text: "Report submitted on time" }] },
        { title: "Documentation and Desk Work", type: "Custom", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "~2 days/month for field notes, MIS updates, partner communications, and coordination.", checklist: [{ text: "Field visit notes compiled" }, { text: "MIS / database updated" }, { text: "Partner communications responded to" }, { text: "Pending escalations followed up" }, { text: "Leave and attendance recorded" }] },
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
        { title: `WR: Combined Community & Partner Review — ${clusters}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Combined monthly meeting: community group reps + partner team together. Covers WR cases, partner progress, and issues. Run for each base cluster on rotation.", checklist: [{ text: "Community group representatives present" }, { text: "Partner (coordinator + COs) present" }, { text: "Active WR cases reviewed" }, { text: "Previous month action items followed up" }, { text: "Next month priorities agreed" }, { text: "Notes shared with partner within 2 days" }] },
        { title: `WR: Rights Training (Quarterly) — ${clusters}`, type: "Training", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Quarterly rights training for partner team. Can be run as a joint session across all base clusters in the zone.", checklist: [{ text: "Training topic selected for the quarter" }, { text: "All base cluster COs invited" }, { text: "Training material prepared" }, { text: "Attendance recorded" }, { text: "Follow-up material distributed" }] },
        { title: `Children: Weekly Centre Visit — ${clusters}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Visit children's centre once a week (½ day). Rotate across clusters if covering more than one.", checklist: [{ text: "Centre activities observed" }, { text: "Coordinator supported" }, { text: "Attendance register reviewed" }, { text: "Learning quality spot-check done" }, { text: "Material needs noted" }] },
        { title: `Children: Monthly Training — ${clusters}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly children's programme training. Reinforce with coordinator.", checklist: [{ text: "Full session attended" }, { text: "Key points shared with coordinator" }, { text: "Attendance recorded" }] },
        { title: `Youth: Fortnightly Centre Visit + CAP Review — ${clusters}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Visit youth centre fortnightly (every other Saturday). Lighter than typical given lower scale.", checklist: [{ text: "Visit 1 (fortnight 1): centre visited" }, { text: "Visit 1: youth groups met, CAP reviewed" }, { text: "Visit 2 (fortnight 2): centre visited" }, { text: "Visit 2: youth groups met, CAP reviewed" }, { text: "Issues and wins documented" }] },
        { title: `Youth: Monthly Training — ${clusters}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly youth programme training.", checklist: [{ text: "Full session attended" }, { text: "Coordinator briefed post-training" }, { text: "Attendance recorded" }] },
        { title: `Elderly: Monthly Review + Team Training — ${clusters}`, type: "Review", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Combined monthly session: review centre + outreach, then conduct team training in one visit day.", checklist: [{ text: "Centre visited and operations observed" }, { text: "Outreach coverage reviewed" }, { text: "Caregiver welfare checked" }, { text: "Training topic delivered" }, { text: "Action points documented" }] },
        { title: `Elderly: Field Day with CO — ${clusters}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Spend one day with the community organizer on the field. Base cluster typically has 1 CO.", checklist: [{ text: "Field day with CO completed" }, { text: "Outreach households visited and observed" }, { text: "CO capacity gaps identified" }, { text: "Coaching provided" }, { text: "Observations documented" }] },
        { title: `Elderly: CSO Referral Mapping — ${clusters}`, type: "Research", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Map and establish CSO / govt service referrals for elderly in all base clusters.", checklist: [{ text: "CSOs / govt services identified" }, { text: "At least 1 new referral contact established per cluster" }, { text: "Referral directory updated" }, { text: "At least 1 referral completed and documented" }] },
        { title: `Creche: Monthly Rounds — ${clusters}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly visits to all creches across base clusters (~5–6 per cluster). ~1.5 days per cluster.", checklist: [{ text: "All creches in all base clusters visited" }, { text: "Caregiver conduct observed" }, { text: "Child nutrition records reviewed" }, { text: "Hygiene and safety checked" }, { text: "Issues flagged to supervisor" }, { text: "Creche visit log updated" }] },
        { title: `Creche: Supervisor Review — ${clusters}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with creche supervisors covering all base clusters.", checklist: [{ text: "Supervisors for all clusters attended" }, { text: "Monthly rounds findings discussed" }, { text: "Caregiver concerns addressed" }, { text: "Action items documented" }] },
        { title: "City / Zonal Team Review", type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly city or zonal review. Present updates across all base clusters.", checklist: [{ text: "Attended review" }, { text: "Update presented for all clusters" }, { text: "Cross-learning shared" }, { text: "Action items noted" }] },
        { title: `Quarterly Report — ${clusters}`, type: "Review", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Quarterly report covering all base clusters managed in one document.", checklist: [{ text: "Data compiled for all clusters" }, { text: "Partner inputs received" }, { text: "Challenges and learnings written" }, { text: "Next quarter priorities per cluster drafted" }, { text: "Report reviewed with PM and submitted" }] },
        { title: "Documentation and Desk Work", type: "Custom", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Field notes, MIS updates, communications across 2–3 clusters.", checklist: [{ text: "Field notes compiled for all clusters" }, { text: "MIS updated for all clusters" }, { text: "Partner communications responded to" }, { text: "Leave and attendance recorded" }] },
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
        { text: `Centre ${i + 1}: visit 1 of 2 this week` },
        { text: `Centre ${i + 1}: visit 2 of 2 this week` },
      ]).flat();
      return [
        // WR — same as typical
        { title: `WR: Community Group Meeting — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly meeting with all community groups. Full coverage may have more slums — ensure all are represented.", checklist: [{ text: "Pre-meeting agenda circulated" }, { text: "All community groups represented" }, { text: "Active WR cases reviewed" }, { text: "Issues documented" }, { text: "Follow-up actions assigned" }, { text: "Notes shared with partner" }] },
        { title: `WR: Partner Review Meeting — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with partner team. Full coverage may have more COs — plan extra time.", checklist: [{ text: "All COs and coordinator present" }, { text: "Previous month actions reviewed" }, { text: "Pending cases updated" }, { text: "Next month priorities agreed" }] },
        { title: `WR: Rights Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly training on civic amenities, land, housing rights, and welfare schemes.", checklist: [{ text: "Topic selected" }, { text: "Material prepared" }, { text: "All COs attended" }, { text: "Practice included" }, { text: "Attendance recorded" }] },
        // CHILDREN — multiple centres + weekly school
        { title: `Children: Centre Visits — All ${cc} Centres (Twice-Weekly) — ${cluster}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: `Visit each of the ${cc} children's centres twice a week. This is the highest-effort item (~8–12 days/month).`, checklist: [...centreChecklist, { text: "Coordinator support given at each centre" }, { text: "Learning quality spot-check in at least 2 centres" }, { text: "Issues and material needs flagged" }] },
        { title: `Children: Monthly Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly training. With multiple centres, ensure all coordinators are briefed post-session.", checklist: [{ text: "Full session attended" }, { text: `All ${cc} centre coordinators briefed` }, { text: "Attendance recorded" }] },
        { title: `Children: Weekly Govt School Visit + DI Coordination — ${cluster}`, type: "Meeting", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Weekly school visit (¼ day). Full coverage includes active school-community work and dropout tracking.", checklist: [{ text: "Target school visited this week" }, { text: "School head / teacher met" }, { text: "Out-of-school / dropout follow-up done" }, { text: "DI coordination progressed" }, { text: "Field notes recorded" }] },
        // YOUTH — multiple centres
        { title: `Youth: Saturday Visits — All Centres + CAP Review — ${cluster}`, type: "SiteVisit", recurrence: "Weekly", startSlaDays: 0, slaDays: 7, notes: "Visit all youth centres every Saturday and review CAP progress. Full coverage has 2–3 centres.", checklist: [{ text: "Youth Centre 1 visited" }, { text: "Youth Centre 2 visited" }, { text: "Youth Centre 3 visited (if applicable)" }, { text: "Youth groups met for CAP review in each centre" }, { text: "CAP milestones updated" }, { text: "Each coordinator supported" }] },
        { title: `Youth: Monthly Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Attend monthly training. Ensure all centre coordinators are briefed.", checklist: [{ text: "Full session attended" }, { text: "All youth coordinators briefed" }, { text: "Attendance recorded" }] },
        // ELDERLY — same as typical
        { title: `Elderly: Monthly Centre and Outreach Review — ${cluster}`, type: "Review", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review of elderly care centre and outreach. No change from typical cluster.", checklist: [{ text: "Centre visited" }, { text: "Outreach coverage reviewed" }, { text: "Caregiver welfare checked" }, { text: "Referral cases followed up" }, { text: "Issues escalated" }] },
        { title: `Elderly: Monthly Team Training — ${cluster}`, type: "Training", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly training for the full elderly care team.", checklist: [{ text: "All staff attended" }, { text: "Training topic prepared" }, { text: "Action points documented" }] },
        { title: `Elderly: Field Day with COs — ${cluster}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "One full day each with CO-1 and CO-2. 2 days/month total.", checklist: [{ text: "Field day with CO-1 completed" }, { text: "Field day with CO-2 completed" }, { text: "Observations documented for both" }, { text: "Coaching provided" }] },
        { title: `Elderly: CSO Referral Network — ${cluster}`, type: "Research", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Map and maintain referral network. Full coverage = higher referral volume — ensure network is active.", checklist: [{ text: "Referral directory reviewed and updated" }, { text: "At least 2 new contacts added" }, { text: "Referral utilisation data compiled" }, { text: "At least 2 successful referrals documented" }, { text: "Referral gaps identified and actioned" }] },
        // CRECHES — double
        { title: `Creche: Monthly Rounds — All ${n} Creches — ${cluster}`, type: "SiteVisit", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: `Monthly 2-hour visit to each of the ${n} creches. Plan as a 2-week rolling schedule (~6 days/month).`, checklist: [{ text: "Week 1: first batch of creches visited" }, { text: "Week 2: second batch visited" }, { text: "Week 3: third batch visited" }, { text: "Week 4: fourth batch visited" }, { text: "Caregiver conduct observed in all creches" }, { text: "Nutrition records reviewed" }, { text: "Safety checks done" }, { text: "Concerns flagged same day" }, { text: `All ${n} creches logged` }] },
        { title: `Creche: Supervisor Review — ${cluster}`, type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly review with both creche supervisors.", checklist: [{ text: "Both supervisors present" }, { text: "Rounds findings discussed" }, { text: "Caregiver issues addressed" }, { text: "Expansion pipeline reviewed" }, { text: "Action items documented" }] },
        // ADMIN
        { title: "City / Zonal Team Review", type: "Meeting", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "Monthly city/zonal review. Full coverage RP's cluster is a benchmark — bring detailed updates.", checklist: [{ text: "Attended review" }, { text: "Detailed cluster update presented" }, { text: "Lessons from full coverage shared" }, { text: "Systemic issues flagged to PM" }, { text: "Action items noted" }] },
        { title: "Quarterly Report and Programme Review", type: "Review", recurrence: "Quarterly", startSlaDays: 0, slaDays: 90, notes: "Most comprehensive quarterly report. Captures the saturation model in practice and informs planning.", checklist: [{ text: "WR data compiled" }, { text: `Children data — all ${cc} centres compiled` }, { text: "Youth data — all centres compiled" }, { text: "Elderly data compiled" }, { text: `Creche data — all ${n} creches compiled` }, { text: "School engagement outcomes documented" }, { text: "Partner inputs received" }, { text: "What-worked / what-didn't section included" }, { text: "Next quarter priorities drafted" }, { text: "Report reviewed with PM and submitted" }] },
        { title: "Documentation and Desk Work", type: "Custom", recurrence: "Monthly", startSlaDays: 0, slaDays: 30, notes: "~2 days/month. Volume is higher in full coverage given more centres and partner touchpoints.", checklist: [{ text: "Field notes from all centres compiled" }, { text: "MIS updated (all domains)" }, { text: "Partner communications responded to" }, { text: "Escalations followed up" }, { text: "Leave and attendance recorded" }] },
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
    build: buildSchemeLinkageTemplate,
  },
];

export function getTemplate(id: string): GoalTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
