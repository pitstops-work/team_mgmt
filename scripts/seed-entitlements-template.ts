/**
 * Re-seeds the Scheme Linkage & Entitlements Drive template (slug:
 * scheme-linkage-drive) with the 6-pitstop workflow shown in the team
 * spec. Each checklist item carries one or more activities with a chosen
 * completion type (Activity / Upload).
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/seed-entitlements-template.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "", max: 1 });
const prisma = new PrismaClient({ adapter });

type CompletionType = "Activity" | "Voice" | "Upload";
type Activity = { title: string; completionType: CompletionType };
type ChecklistItem = { key: string; text: string; activities: Activity[] };
type Pitstop = {
  type: string;
  title: string;
  notes?: string;
  slaDays: number;
  startSlaDays: number;
  progressTag: string;
  checklist: ChecklistItem[];
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

const item = (text: string, activities: Activity[]): ChecklistItem => ({
  key: slug(text),
  text,
  activities,
});

const A = (title: string): Activity => ({ title, completionType: "Activity" });
const U = (title: string): Activity => ({ title, completionType: "Upload" });

const pitstops: Pitstop[] = [
  // ── 1. Workflow finalised ───────────────────────────────────────────────────
  {
    type: "Discussion",
    title: "Workflow finalised",
    notes: "Identify sample cases, draft the workflow document, and finalise after an internal review.",
    slaDays: 14,
    startSlaDays: 0,
    progressTag: "Baseline",
    checklist: [
      item("Sample applications", [
        A("Field visits"),
        U("Identification of sample cases to apply"),
      ]),
      item("Workflow document", [
        A("Desk work"),
        A("Internal meeting to finalise the workflow"),
        U("Revised document shared"),
      ]),
    ],
  },

  // ── 2. MIS Readiness ────────────────────────────────────────────────────────
  {
    type: "AppDevelopment",
    title: "MIS Readiness",
    notes: "Update Frappe doctype + dashboards, pilot with a small team, then go live.",
    slaDays: 35,
    startSlaDays: 14,
    progressTag: "Infrastructure",
    checklist: [
      item("Module development", [
        A("Update doctype in Frappe"),
        A("Dashboard development"),
        A("Finalise with internal discussion"),
      ]),
      item("Pilot testing", [
        A("Orientation with team who will do the pilot"),
        A("Field visits / validation"),
      ]),
      item("Make it live", [
        A("Make changes in Frappe based on field insights"),
      ]),
    ],
  },

  // ── 3. Training completed ───────────────────────────────────────────────────
  {
    type: "Training",
    title: "Training completed",
    notes: "Orientation for all relevant programme staff.",
    slaDays: 42,
    startSlaDays: 35,
    progressTag: "Training",
    checklist: [
      item("Orientation for all relevant staff", [
        A("Conduct training"),
      ]),
    ],
  },

  // ── 4. Targeting cases — immediate vs complex ──────────────────────────────
  {
    type: "SiteVisit",
    title: "Targeting cases which can be completed immediately and segregation of complex cases",
    notes: "Establish handholding + catch-up rhythm; segregate immediate-fix cases from the complex backlog.",
    slaDays: 72,
    startSlaDays: 42,
    progressTag: "Live",
    checklist: [
      item("Handholding & catch-up rhythm in place", [
        A("Field engagement"),
        A("Catch-up calls / meetings"),
      ]),
    ],
  },

  // ── 5. Completing complex cases ────────────────────────────────────────────
  {
    type: "SiteVisit",
    title: "Completing complex cases",
    notes: "Synthesize the blockers, refine the workflow, push Frappe updates derived from field insights.",
    slaDays: 102,
    startSlaDays: 72,
    progressTag: "Live",
    checklist: [
      item("Synthesize the reasons for complexity", [
        A("Field engagement"),
        A("Catch-up calls / meetings"),
      ]),
      item("Refine the workflow for the same", [
        A("Make changes in Frappe based on field insights"),
      ]),
    ],
  },

  // ── 6. Closure ──────────────────────────────────────────────────────────────
  {
    type: "Review",
    title: "Closure",
    notes: "Validate reasons for cases still incomplete and close the drive with a written review.",
    slaDays: 109,
    startSlaDays: 102,
    progressTag: "Monitoring",
    checklist: [
      item("Validate reasons for those unable to complete", [
        U("Review the data over call / meeting"),
      ]),
    ],
  },
];

async function main() {
  const r = await prisma.$executeRaw`
    UPDATE "GoalTemplateDef"
    SET pitstops = ${JSON.stringify(pitstops)}::jsonb, "updatedAt" = NOW()
    WHERE slug = 'scheme-linkage-drive'
  `;
  console.log(
    `Updated scheme-linkage-drive: ${pitstops.length} pitstops, ` +
    `${pitstops.reduce((s, p) => s + p.checklist.length, 0)} checklist items, ` +
    `${pitstops.reduce((s, p) => s + p.checklist.reduce((c, ci) => c + ci.activities.length, 0), 0)} activities. ` +
    `Rows affected: ${r}`
  );
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
