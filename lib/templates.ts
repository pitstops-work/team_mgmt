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
];

export function getTemplate(id: string): GoalTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
