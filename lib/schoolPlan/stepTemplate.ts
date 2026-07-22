// The 16-step template every SchoolPlan starts with. Instantiated on
// SchoolPlan.create by lib/schoolPlan/instantiate.ts. Data lives here (not in
// the database) so the template can be edited by shipping code — matches how
// SeedingRoleDefn / creche templates work elsewhere.

export type SchoolPlanStepDefn = {
  stepNo: number;
  key: string;
  title: string;
  description: string;
  /** Which plan-page section this step's completion unlocks. "1".."10" or null. */
  planSection: string | null;
  /** If set, an artifact of this kind must be attached before the step can be Done. */
  requiredArtifactType: string | null;
};

export const SCHOOL_PLAN_STEPS: readonly SchoolPlanStepDefn[] = [
  { stepNo: 1,  key: "snapshot_data",        title: "Snapshot data collected",
    description: "School + department records: DISE code, enrolment, timings, head teacher, SDMC.",
    planSection: "1",  requiredArtifactType: null },
  { stepNo: 2,  key: "topographical_survey", title: "Topographical / as-built survey",
    description: "Commission an as-built survey; upload drawings.",
    planSection: "3",  requiredArtifactType: "survey_drawing" },
  { stepNo: 3,  key: "survey_gaps",          title: "Survey gap items resolved",
    description: "Missing interior drawings, structural assessment, parapets, services survey, toilet fixture count.",
    planSection: "3",  requiredArtifactType: null },
  { stepNo: 4,  key: "catchment_map",        title: "Catchment mapped",
    description: "Settlements + child numbers + map (image upload in Phase 1).",
    planSection: "2",  requiredArtifactType: "map" },
  { stepNo: 5,  key: "architect_visit",      title: "Architect design + refurbishment estimate",
    description: "Architect visit; upload design + estimate.",
    planSection: "3",  requiredArtifactType: "architect_design" },
  { stepNo: 6,  key: "services_assessed",    title: "Services & infrastructure assessed",
    description: "Water, electricity, toilets, lighting, drainage, RO plant, boundary, internet.",
    planSection: "4",  requiredArtifactType: null },
  { stepNo: 7,  key: "programme_offer",      title: "Programme offer drafted",
    description: "Per-component: offer, schedule, children/day, delivery ownership.",
    planSection: "5",  requiredArtifactType: null },
  { stepNo: 8,  key: "anchor_confirmed",     title: "Anchor partner confirmed",
    description: "Anchor partner agreement status.",
    planSection: "6",  requiredArtifactType: "partner_agreement" },
  { stepNo: 9,  key: "specialists_vetted",   title: "Specialist partners identified & vetted",
    description: "Plans vetted by us until our own curriculum is developed.",
    planSection: "5",  requiredArtifactType: "partner_agreement" },
  { stepNo: 10, key: "staffing_plan",        title: "Staffing plan + payroll mapping",
    description: "Roles, counts, payroll (us/anchor/specialist/agency), status.",
    planSection: "6",  requiredArtifactType: null },
  { stepNo: 11, key: "vendor_quotes",        title: "Vendor quotes",
    description: "Security, housekeeping, food — upload quotes.",
    planSection: "8",  requiredArtifactType: "vendor_quote" },
  { stepNo: 12, key: "budget_assembled",     title: "Budget assembled vs standard",
    description: "Fill this school's budget lines. Deviation vs standard is computed automatically.",
    planSection: "8",  requiredArtifactType: null },
  { stepNo: 13, key: "dept_permissions",     title: "Departmental permissions",
    description: "Directorate of Minorities sign-off on the plan.",
    planSection: "7",  requiredArtifactType: "permission_letter" },
  { stepNo: 14, key: "timeline_agreed",      title: "Timeline agreed",
    description: "Milestones: survey → design → permissions → civil works → agreements → staff → soft launch → full operation.",
    planSection: "7",  requiredArtifactType: null },
  { stepNo: 15, key: "risks_logged",         title: "Risks & open issues logged",
    description: "Risk register with mitigation + owner.",
    planSection: "9",  requiredArtifactType: null },
  { stepNo: 16, key: "review_approved",      title: "Review by city lead → approval",
    description: "Prepared → reviewed → approved with dates.",
    planSection: "10", requiredArtifactType: null },
] as const;

export const STEP_BY_NO: Record<number, SchoolPlanStepDefn> =
  Object.fromEntries(SCHOOL_PLAN_STEPS.map((s) => [s.stepNo, s]));

// ---------- Static reference data shared across the module ----------

/** Service checklist items on §4. Order matters (used on the plan page). */
export const SERVICE_ITEMS: { key: string; label: string }[] = [
  { key: "water",       label: "Water source & storage" },
  { key: "electricity", label: "Electricity connection, load, meter" },
  { key: "toilets",     label: "Toilets — count & condition" },
  { key: "lighting",    label: "Lighting for evening use" },
  { key: "drainage",    label: "Drainage & sewage" },
  { key: "ro_plant",    label: "RO plant (location, source, reject water)" },
  { key: "boundary",    label: "Boundary wall & gate" },
  { key: "internet",    label: "Internet" },
];

/** Programme components (§5). deliveredBy default reflects the ownership matrix
 *  from the GC status note; users can override per plan. */
export const PROGRAMME_COMPONENTS: {
  key: string;
  label: string;
  defaultDelivery: "us" | "anchor" | "specialist" | "agency";
}[] = [
  { key: "creche",    label: "Crèche (6 mo – 3 yr)",          defaultDelivery: "anchor"     },
  { key: "library",   label: "Library",                        defaultDelivery: "anchor"     },
  { key: "lab",       label: "Science / tinkering lab",        defaultDelivery: "us"         },
  { key: "art_music", label: "Art & music",                    defaultDelivery: "specialist" },
  { key: "sports",    label: "Sports",                         defaultDelivery: "specialist" },
  { key: "computing", label: "Computing",                      defaultDelivery: "specialist" },
  { key: "youth",     label: "Youth (career, skills, counsel)",defaultDelivery: "specialist" },
  { key: "community", label: "Community engagement",           defaultDelivery: "anchor"     },
];

/** The 5 pilot schools (seeded row set). */
export const PILOT_SCHOOLS: {
  name: string;
  officialName: string;
  taluk?: string;
  district?: string;
  targetChildrenPerDay: number;
}[] = [
  { name: "Yelahanka",       officialName: "Moulana Azad Model School, Chowdeshwari Layout",   taluk: "Yelahanka",       district: "Bangalore Urban", targetChildrenPerDay: 300 },
  { name: "Shikaripalya",    officialName: "Moulana Azad Model School, Shikaripalya",          taluk: "Anekal",          district: "Bangalore Urban", targetChildrenPerDay: 300 },
  { name: "Anekal",          officialName: "Moulana Azad Model School, Anekal",                taluk: "Anekal",          district: "Bangalore Urban", targetChildrenPerDay: 300 },
  { name: "Vidyaranyapura",  officialName: "Moulana Azad Model School, Vidyaranyapura",        taluk: "Bangalore North", district: "Bangalore Urban", targetChildrenPerDay: 300 },
  { name: "DJ Halli",        officialName: "Moulana Azad Model School, DJ Halli (interim)",    taluk: "Bangalore East",  district: "Bangalore Urban", targetChildrenPerDay: 300 },
];
