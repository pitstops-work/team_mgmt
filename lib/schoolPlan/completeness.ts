// Derived completeness of a school plan. Sections 0..10 correspond to the plan
// page's section headings; the plan can move to "for_review" only when every
// section is complete. A section is complete when
//   (a) every step feeding it is Done or Not-applicable, AND
//   (b) every required field on that section has a value, AND
//   (c) every requiredArtifactType is present as an artifact.

import { SCHOOL_PLAN_STEPS } from "./stepTemplate";
import type { SchoolPlanStepStatusValue } from "./types";

export type PlanForCompleteness = {
  id: string;
  name: string;
  officialName: string | null;
  district: string | null;
  headTeacherName: string | null;
  enrolmentBoys: number | null;
  enrolmentGirls: number | null;
  targetChildrenPerDay: number | null;
  siteAreaSqft: number | null;
  builtupAreaSqft: number | null;
  surveyStatus: string | null;
  capacityRead: string | null;
  mobilisationNotes: string | null;
  budgetId: string | null;
  ourLeadUserId: string | null;
  anchorPartnerName: string | null;
  steps: { stepNo: number; status: SchoolPlanStepStatusValue }[];
  settlementsCount: number;
  spacesCount: number;
  servicesAssessedCount: number; // status != unknown
  componentsWithOfferCount: number;
  staffingCount: number;
  milestonesCount: number;
  risksCount: number;
  artifactsByKind: Record<string, number>;
  signoffApproved: boolean;
};

export type SectionCompleteness = {
  section: string;                    // "1".."10"
  title: string;
  ready: boolean;                     // all requirements met
  missing: string[];                  // human-readable list of what's still needed
};

const SECTION_TITLES: Record<string, string> = {
  "1":  "School snapshot",
  "2":  "Catchment",
  "3":  "Space",
  "4":  "Services & infrastructure",
  "5":  "Programme offer",
  "6":  "Staffing & operating model",
  "7":  "Timeline",
  "8":  "Budget",
  "9":  "Risks & open issues",
  "10": "Sign-off",
};

/** Which artifact kinds a given plan section requires. Derived from the step
 *  template's requiredArtifactType, grouped by planSection. */
function requiredArtifactsForSection(section: string): string[] {
  return SCHOOL_PLAN_STEPS
    .filter((s) => s.planSection === section && s.requiredArtifactType)
    .map((s) => s.requiredArtifactType as string);
}

function stepsForSection(section: string): number[] {
  return SCHOOL_PLAN_STEPS
    .filter((s) => s.planSection === section)
    .map((s) => s.stepNo);
}

function isStepDone(status: SchoolPlanStepStatusValue): boolean {
  return status === "done" || status === "not_applicable";
}

export function sectionCompleteness(
  section: string,
  plan: PlanForCompleteness,
): SectionCompleteness {
  const missing: string[] = [];
  const stepNos = stepsForSection(section);
  const stepMap = new Map(plan.steps.map((s) => [s.stepNo, s.status]));
  for (const n of stepNos) {
    const st = stepMap.get(n);
    if (!st || !isStepDone(st)) missing.push(`step ${n} not done`);
  }
  for (const kind of requiredArtifactsForSection(section)) {
    if (!plan.artifactsByKind[kind]) missing.push(`missing artefact: ${kind}`);
  }

  // Section-specific required-field checks.
  switch (section) {
    case "1":
      if (!plan.officialName) missing.push("official school name");
      if (!plan.headTeacherName) missing.push("head teacher");
      if (plan.enrolmentBoys == null || plan.enrolmentGirls == null) missing.push("enrolment");
      if (plan.targetChildrenPerDay == null) missing.push("children/day planned");
      if (!plan.ourLeadUserId) missing.push("our lead");
      break;
    case "2":
      if (plan.settlementsCount === 0) missing.push("at least one settlement");
      if (!plan.mobilisationNotes) missing.push("mobilisation notes");
      break;
    case "3":
      if (plan.spacesCount === 0) missing.push("at least one space");
      if (!plan.siteAreaSqft) missing.push("site area");
      if (!plan.builtupAreaSqft) missing.push("built-up area");
      break;
    case "4":
      if (plan.servicesAssessedCount < 8) missing.push("all 8 services assessed");
      break;
    case "5":
      if (plan.componentsWithOfferCount === 0) missing.push("programme components filled");
      break;
    case "6":
      if (plan.staffingCount === 0) missing.push("staffing plan");
      if (!plan.anchorPartnerName) missing.push("anchor partner");
      break;
    case "7":
      if (plan.milestonesCount === 0) missing.push("timeline milestones");
      break;
    case "8":
      if (!plan.budgetId) missing.push("budget attached");
      break;
    case "9":
      if (plan.risksCount === 0) missing.push("risks logged");
      break;
    case "10":
      if (!plan.signoffApproved) missing.push("sign-off not approved");
      break;
  }

  return {
    section,
    title: SECTION_TITLES[section] ?? section,
    ready: missing.length === 0,
    missing,
  };
}

export function planCompleteness(plan: PlanForCompleteness): {
  sections: SectionCompleteness[];
  ready: boolean;
  readyCount: number;
} {
  const sections = ["1","2","3","4","5","6","7","8","9","10"].map((s) => sectionCompleteness(s, plan));
  const ready = sections.every((s) => s.ready);
  const readyCount = sections.filter((s) => s.ready).length;
  return { sections, ready, readyCount };
}
