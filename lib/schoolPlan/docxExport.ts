// Build a School Plan .docx from the same data model the plan page renders.
// Approximates the 10-section structure from the brief. When the finalized
// Word template arrives, we can layer image + styles on top (Annexure A, B, C).

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import type { SchoolPlanStepStatusValue } from "./types";

const NAVY = "1F3A5F";
const PALE = "E9EEF6";
const AMBER = "FFF7ED";

type PlanRow = {
  id: string;
  name: string;
  officialName: string | null;
  diseCode: string | null;
  schoolType: string | null;
  addressText: string | null;
  district: string | null;
  ward: string | null;
  yearEstablished: number | null;
  grades: string | null;
  sections: string | null;
  mediums: string[];
  enrolmentBoys: number | null;
  enrolmentGirls: number | null;
  teachersSanctioned: number | null;
  teachersWorking: number | null;
  classroomsCount: number | null;
  otherRoomsCount: number | null;
  timings: string | null;
  shifts: string | null;
  vacationMonths: string[];
  headTeacherName: string | null;
  headTeacherPhone: string | null;
  sdmcStatus: string | null;
  deptContactName: string | null;
  siteAreaSqft: number | null;
  builtupAreaSqft: number | null;
  surveyStatus: string | null;
  targetChildrenPerDay: number | null;
  capacityRead: string | null;
  mobilisationNotes: string | null;
  campusAfterHoursUse: string | null;
  isInterimStructure: boolean;
  interimStructureSpec: string | null;
  planStatus: string;
  planVersion: number;
  ourLead: { name: string | null; email: string } | null;
  anchorLabel: string | null;
  settlements: { name: string; distanceMeters: number | null; walkMinutes: number | null; children0to3: number | null; children3to14: number | null; children14to18: number | null; existingServices: string | null }[];
  spaces: { building: string | null; floor: string | null; name: string; sizeSqm: number | null; currentUse: string | null; proposedUse: string | null; capacityPerSession: number | null; sessionsPerDay: number | null; changesNeeded: string | null; structuralFlags: string | null }[];
  services: { item: string; label: string; status: string; details: string | null }[];
  components: { key: string; label: string; offerText: string | null; deliveredBy: string; schedule: string | null; childrenPerDay: number | null; planVetted: boolean }[];
  staffing: { role: string; count: number; payroll: string; status: string; notes: string | null }[];
  milestones: { name: string; targetDate: Date | null; status: string }[];
  risks: { description: string; mitigation: string | null; status: string }[];
  signoff: { preparedAt: Date | null; reviewedAt: Date | null; approvedAt: Date | null; reviewerNotes: string | null; approvalNotes: string | null } | null;
  budget: { name: string; y1Recurring: number; y1Capex: number } | null;
  steps: { stepNo: number; title: string; status: SchoolPlanStepStatusValue; ownerLabel: string | null; dueDate: Date | null }[];
  deviationPct: number | null;
  standardRecurring: number;
  standardTotal: number;
  seesSensitive: boolean;
};

function nearWhite(text: string, opts?: { bold?: boolean }): TextRun {
  return new TextRun({ text, bold: opts?.bold, color: "0C1220" });
}
function stone(text: string): TextRun {
  return new TextRun({ text, color: "78716C" });
}

function sectionBar(n: string, title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    shading: { type: ShadingType.CLEAR, color: NAVY, fill: NAVY },
    children: [new TextRun({ text: `§${n} · ${title}`, color: "FFFFFF", bold: true, size: 22 })],
    spacing: { before: 300, after: 100 },
  });
}

function kv(k: string, v: string | number | null | undefined): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${k}: `, color: "78716C" }),
      new TextRun({ text: v == null || v === "" ? "—" : String(v), bold: true }),
    ],
    spacing: { after: 40 },
  });
}

function tableHeader(cells: string[]): TableRow {
  return new TableRow({
    tableHeader: true,
    children: cells.map((c) => new TableCell({
      shading: { type: ShadingType.CLEAR, color: PALE, fill: PALE },
      children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 18 })] })],
    })),
  });
}
function row(cells: (string | number | null | undefined)[]): TableRow {
  return new TableRow({
    children: cells.map((c) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: c == null || c === "" ? "—" : String(c), size: 18 })] })],
    })),
  });
}
function fullTable(rows: TableRow[]) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}
function amberBox(text: string): Paragraph {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, color: AMBER, fill: AMBER },
    children: [new TextRun({ text, color: "78350F" })],
    spacing: { before: 100, after: 100 },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: "FCD34D" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "FCD34D" },
      left:   { style: BorderStyle.SINGLE, size: 1, color: "FCD34D" },
      right:  { style: BorderStyle.SINGLE, size: 1, color: "FCD34D" },
    },
  });
}
function inr(rupees: number): string {
  const abs = Math.abs(rupees);
  if (abs >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000)   return `₹${(rupees / 1_00_000).toFixed(2)} L`;
  return `₹${rupees.toLocaleString("en-IN")}`;
}
function ymd(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

export async function buildSchoolPlanDocx(plan: PlanRow): Promise<Buffer> {
  const enrolTotal = (plan.enrolmentBoys ?? 0) + (plan.enrolmentGirls ?? 0);

  const children: (Paragraph | Table)[] = [
    // ── Cover ─────────────────────────────────────────────────────────────
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: `AFTER-SCHOOL CENTRES · DIRECTORATE OF MINORITIES · ${plan.district ?? "BANGALORE"}`, size: 16, color: "78716C" })],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [nearWhite(`School Plan · ${plan.name}`, { bold: true })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [stone(plan.officialName ?? "— official name pending —")],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Status: `, color: "78716C" }),
        new TextRun({ text: plan.planStatus, bold: true }),
        new TextRun({ text: `   ·   Version ${plan.planVersion}`, color: "78716C" }),
      ],
    }),
    ...(plan.isInterimStructure ? [amberBox("Interim structure. The Directorate has not yet constructed the school building. §3 uses an interim-structure spec in place of the as-built survey.")] : []),

    // ── §1 School snapshot ─────────────────────────────────────────────────
    sectionBar("1", "School snapshot"),
    kv("Official name", plan.officialName),
    kv("Type", plan.schoolType),
    kv("DISE code", plan.diseCode),
    kv("Address", plan.addressText),
    kv("Ward", plan.ward),
    kv("Year established", plan.yearEstablished),
    kv("Grades / sections", `${plan.grades ?? "—"} / ${plan.sections ?? "—"}`),
    kv("Medium(s)", plan.mediums.join(", ")),
    kv("Enrolment (b/g/total)", `${plan.enrolmentBoys ?? "—"} / ${plan.enrolmentGirls ?? "—"} / ${enrolTotal || "—"}`),
    kv("Teachers (sanctioned/working)", `${plan.teachersSanctioned ?? "—"} / ${plan.teachersWorking ?? "—"}`),
    kv("Classrooms / other rooms", `${plan.classroomsCount ?? "—"} / ${plan.otherRoomsCount ?? "—"}`),
    kv("Timings / shifts", `${plan.timings ?? "—"} · ${plan.shifts ?? "—"}`),
    kv("Vacation months", plan.vacationMonths.join(", ")),
    kv("Head teacher", plan.headTeacherName),
    ...(plan.seesSensitive ? [kv("Head teacher phone", plan.headTeacherPhone)] : []),
    kv("SDMC", plan.sdmcStatus),
    ...(plan.seesSensitive ? [kv("Department contact", plan.deptContactName)] : []),
    kv("Our lead", plan.ourLead?.name ?? plan.ourLead?.email ?? null),
    kv("Anchor partner", plan.anchorLabel),
    kv("Site area (sq ft)", plan.siteAreaSqft),
    kv("Built-up (sq ft)", plan.builtupAreaSqft),
    kv("Survey status", plan.surveyStatus),
    kv("Children/day planned", plan.targetChildrenPerDay),
    kv("After-hours campus use", plan.campusAfterHoursUse),
    kv("Capacity read", plan.capacityRead),

    // ── §2 Catchment ───────────────────────────────────────────────────────
    sectionBar("2", "Catchment"),
    kv("Mobilisation notes", plan.mobilisationNotes),
    ...(plan.settlements.length === 0
      ? [new Paragraph({ children: [stone("— no settlements listed —")] })]
      : [fullTable([
          tableHeader(["Settlement", "Distance / walk", "0–3", "3–14", "14–18", "Services"]),
          ...plan.settlements.map((s) => row([
            s.name,
            `${s.distanceMeters ?? "—"} m${s.walkMinutes ? ` · ${s.walkMinutes} min` : ""}`,
            s.children0to3, s.children3to14, s.children14to18,
            s.existingServices,
          ])),
        ])]),

    // ── §3 Space ──────────────────────────────────────────────────────────
    sectionBar("3", "Space"),
    ...(plan.isInterimStructure
      ? [amberBox("Interim structure spec"), new Paragraph({ children: [nearWhite(plan.interimStructureSpec ?? "— pending —")] })]
      : plan.spaces.length === 0
        ? [new Paragraph({ children: [stone("— no spaces listed —")] })]
        : [fullTable([
            tableHeader(["Building / floor", "Space", "sqm", "Current use", "Proposed use", "Capacity × sessions", "Changes / flags"]),
            ...plan.spaces.map((s) => row([
              [s.building, s.floor].filter(Boolean).join(" · "),
              s.name,
              s.sizeSqm?.toFixed(1),
              s.currentUse, s.proposedUse,
              s.capacityPerSession != null ? `${s.capacityPerSession} × ${s.sessionsPerDay ?? 1}` : null,
              [s.changesNeeded, s.structuralFlags].filter(Boolean).join(" · "),
            ])),
          ])]),

    // ── §4 Services & infrastructure ──────────────────────────────────────
    sectionBar("4", "Services & infrastructure"),
    fullTable([
      tableHeader(["Item", "Status", "Details"]),
      ...plan.services.map((s) => row([s.label, s.status.toUpperCase(), s.details])),
    ]),

    // ── §5 Programme offer ────────────────────────────────────────────────
    sectionBar("5", "Programme offer"),
    fullTable([
      tableHeader(["Component", "Offer", "Delivered by", "Schedule", "Children/day", "Vetted"]),
      ...plan.components.map((c) => row([
        c.label, c.offerText, c.deliveredBy, c.schedule, c.childrenPerDay,
        c.planVetted ? "yes" : "no",
      ])),
    ]),

    // ── §6 Staffing ───────────────────────────────────────────────────────
    sectionBar("6", "Staffing & operating model"),
    kv("Anchor partner", plan.anchorLabel),
    ...(plan.staffing.length === 0
      ? [new Paragraph({ children: [stone("— no staffing plan —")] })]
      : [fullTable([
          tableHeader(["Role", "Count", "Payroll", "Status", ...(plan.seesSensitive ? ["Notes"] : [])]),
          ...plan.staffing.map((r) => row([r.role, r.count, r.payroll, r.status, ...(plan.seesSensitive ? [r.notes] : [])])),
        ])]),

    // ── §7 Timeline ───────────────────────────────────────────────────────
    sectionBar("7", "Timeline"),
    ...(plan.milestones.length === 0
      ? [new Paragraph({ children: [stone("— no milestones —")] })]
      : [fullTable([
          tableHeader(["Milestone", "Target date", "Status"]),
          ...plan.milestones.map((m) => row([m.name, ymd(m.targetDate), m.status])),
        ])]),

    // ── §8 Budget ─────────────────────────────────────────────────────────
    sectionBar("8", "Budget"),
    ...(plan.seesSensitive
      ? plan.budget
        ? [
            kv("Budget", plan.budget.name),
            kv("Y1 capex", inr(plan.budget.y1Capex)),
            kv("Y1 recurring", inr(plan.budget.y1Recurring)),
            kv("Standard recurring", inr(plan.standardRecurring)),
            plan.deviationPct != null && Math.abs(plan.deviationPct) > 10
              ? amberBox(`⚠ GC re-approval flag. Recurring deviates ${plan.deviationPct.toFixed(1)}% from the standard ₹36,000/child/year envelope.`)
              : new Paragraph({ children: [stone("Within threshold.")] }),
          ]
        : [new Paragraph({ children: [stone("— no budget attached —")] })]
      : [new Paragraph({ children: [stone("Budget details restricted for this role.")] })]),

    // ── §9 Risks ──────────────────────────────────────────────────────────
    sectionBar("9", "Risks & open issues"),
    ...(plan.risks.length === 0
      ? [new Paragraph({ children: [stone("— no risks logged —")] })]
      : [fullTable([
          tableHeader(["Risk", "Mitigation", "Status"]),
          ...plan.risks.map((r) => row([r.description, r.mitigation, r.status])),
        ])]),

    // ── §10 Sign-off ──────────────────────────────────────────────────────
    sectionBar("10", "Sign-off"),
    kv("Prepared", ymd(plan.signoff?.preparedAt ?? null)),
    kv("Reviewed",  ymd(plan.signoff?.reviewedAt ?? null)),
    kv("Approved", ymd(plan.signoff?.approvedAt ?? null)),
    ...(plan.signoff?.reviewerNotes ? [kv("Reviewer notes", plan.signoff.reviewerNotes)] : []),
    ...(plan.signoff?.approvalNotes ? [kv("Approval notes", plan.signoff.approvalNotes)] : []),

    // ── Annexure: step tracker ────────────────────────────────────────────
    sectionBar("A", "Annexure · step tracker"),
    fullTable([
      tableHeader(["#", "Step", "Owner", "Due", "Status"]),
      ...plan.steps.map((s) => row([s.stepNo, s.title, s.ownerLabel, ymd(s.dueDate), s.status])),
    ]),
  ];

  const doc = new Document({
    creator: "Pitstops · School Plans",
    title: `School Plan — ${plan.name}`,
    description: `After-School Centre plan for ${plan.officialName ?? plan.name}`,
    sections: [{ children }],
  });
  return await Packer.toBuffer(doc);
}
