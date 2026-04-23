/**
 * One-time seed: convert all code-based templates in lib/templates.ts into
 * GoalTemplateDef rows. Run with:
 *   npx tsx scripts/seed-templates.ts
 */

import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  TEMPLATES,
  GoalTemplate,
  PitstopTemplate,
  TemplateParameter,
} from "../lib/templates";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const DB_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("No MIGRATE_DATABASE_URL or DATABASE_URL in .env.local");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: DB_URL, max: 1 });
const prisma = new PrismaClient({ adapter });

interface SeedEntry {
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  needsDomain: string | null;
  sortOrder: number;
  parameters: TemplateParameter[];
  pitstops: PitstopTemplate[];
}

function getTemplate(id: string): GoalTemplate {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Template not found: ${id}`);
  return t;
}

function build(id: string, params: Record<string, string | number>): PitstopTemplate[] {
  return getTemplate(id).build(params);
}

function withoutParam(params: TemplateParameter[], key: string): TemplateParameter[] {
  return params.filter((p) => p.key !== key);
}

function paramsWith(params: TemplateParameter[]): TemplateParameter[] {
  return params;
}

const entries: SeedEntry[] = [
  // ── Community Programs ──────────────────────────────────────────────────────
  {
    slug: "creche-program",
    name: "Creche Programme",
    description: getTemplate("creche-program").description,
    category: "Community Programs",
    icon: "🏠",
    needsDomain: "Creche",
    sortOrder: 0,
    parameters: withoutParam(getTemplate("creche-program").parameters, "track"),
    pitstops: build("creche-program", { track: "new", creches: 5 }),
  },
  {
    slug: "creche-program-existing",
    name: "Creche Programme (Existing)",
    description: "Monthly monitoring and supervision pitstops for an existing creche programme.",
    category: "Community Programs",
    icon: "🏠",
    needsDomain: null,
    sortOrder: 1,
    parameters: withoutParam(getTemplate("creche-program").parameters, "track"),
    pitstops: build("creche-program", { track: "existing", creches: 5 }),
  },
  {
    slug: "welfare-rights",
    name: "Welfare Rights Programme",
    description: getTemplate("welfare-rights").description,
    category: "Community Programs",
    icon: "⚖️",
    needsDomain: null,
    sortOrder: 2,
    parameters: paramsWith(getTemplate("welfare-rights").parameters),
    pitstops: build("welfare-rights", { clusters: 2 }),
  },
  {
    slug: "children-learning-centre",
    name: "Children Learning Centre",
    description: getTemplate("children-learning-centre").description,
    category: "Community Programs",
    icon: "📚",
    needsDomain: "ChildrenCentre",
    sortOrder: 3,
    parameters: withoutParam(getTemplate("children-learning-centre").parameters, "track"),
    pitstops: build("children-learning-centre", { track: "new", centres: 2 }),
  },
  {
    slug: "children-learning-centre-existing",
    name: "Children Learning Centre (Existing)",
    description: "Weekly and monthly monitoring pitstops for an existing CLC.",
    category: "Community Programs",
    icon: "📚",
    needsDomain: null,
    sortOrder: 4,
    parameters: withoutParam(getTemplate("children-learning-centre").parameters, "track"),
    pitstops: build("children-learning-centre", { track: "existing", centres: 2 }),
  },
  {
    slug: "youth-resource-centre",
    name: "Youth Resource Centre",
    description: getTemplate("youth-resource-centre").description,
    category: "Community Programs",
    icon: "🌱",
    needsDomain: "YouthResourceCentre",
    sortOrder: 5,
    parameters: withoutParam(getTemplate("youth-resource-centre").parameters, "track"),
    pitstops: build("youth-resource-centre", { track: "new", yrcs: 2 }),
  },
  {
    slug: "youth-resource-centre-existing",
    name: "Youth Resource Centre (Existing)",
    description: "Weekly and monthly monitoring pitstops for an existing YRC.",
    category: "Community Programs",
    icon: "🌱",
    needsDomain: null,
    sortOrder: 6,
    parameters: withoutParam(getTemplate("youth-resource-centre").parameters, "track"),
    pitstops: build("youth-resource-centre", { track: "existing", yrcs: 2 }),
  },
  {
    slug: "water-atm",
    name: "Water ATM / RO Plant",
    description: getTemplate("water-atm").description,
    category: "Community Programs",
    icon: "💧",
    needsDomain: "WaterATM",
    sortOrder: 7,
    parameters: withoutParam(getTemplate("water-atm").parameters, "track"),
    pitstops: build("water-atm", { track: "new", plants: 1, households: 250 }),
  },
  {
    slug: "water-atm-existing",
    name: "Water ATM / RO Plant (Existing)",
    description: "Monthly monitoring pitstops for an existing water ATM / RO plant.",
    category: "Community Programs",
    icon: "💧",
    needsDomain: null,
    sortOrder: 8,
    parameters: withoutParam(getTemplate("water-atm").parameters, "track"),
    pitstops: build("water-atm", { track: "existing", plants: 1, households: 250 }),
  },
  {
    slug: "elderly-kitchen",
    name: "Elderly Community Kitchen",
    description: getTemplate("elderly-kitchen").description,
    category: "Community Programs",
    icon: "🍲",
    needsDomain: "ElderlyKitchen",
    sortOrder: 9,
    parameters: withoutParam(getTemplate("elderly-kitchen").parameters, "track"),
    pitstops: build("elderly-kitchen", { track: "new", kitchens: 3 }),
  },
  {
    slug: "elderly-kitchen-existing",
    name: "Elderly Community Kitchen (Existing)",
    description: "Monthly monitoring pitstops for existing elderly community kitchens.",
    category: "Community Programs",
    icon: "🍲",
    needsDomain: null,
    sortOrder: 10,
    parameters: withoutParam(getTemplate("elderly-kitchen").parameters, "track"),
    pitstops: build("elderly-kitchen", { track: "existing", kitchens: 3 }),
  },
  {
    slug: "elderly-centre",
    name: "Elderly Care Centre & Outreach",
    description: getTemplate("elderly-centre").description,
    category: "Community Programs",
    icon: "🏥",
    needsDomain: "ElderlyCentre",
    sortOrder: 11,
    parameters: withoutParam(getTemplate("elderly-centre").parameters, "track"),
    pitstops: build("elderly-centre", { track: "new" }),
  },
  {
    slug: "elderly-centre-existing",
    name: "Elderly Care Centre & Outreach (Existing)",
    description: "Monitoring pitstops for an existing elderly care programme.",
    category: "Community Programs",
    icon: "🏥",
    needsDomain: null,
    sortOrder: 12,
    parameters: withoutParam(getTemplate("elderly-centre").parameters, "track"),
    pitstops: build("elderly-centre", { track: "existing" }),
  },
  {
    slug: "scheme-linkage-drive",
    name: "Scheme Linkage & Entitlements Drive",
    description: getTemplate("scheme-linkage-drive").description,
    category: "Community Programs",
    icon: "📋",
    needsDomain: null,
    sortOrder: 13,
    parameters: paramsWith(getTemplate("scheme-linkage-drive").parameters),
    pitstops: build("scheme-linkage-drive", { households: 1250 }),
  },

  // ── Programmes ──────────────────────────────────────────────────────────────
  {
    slug: "seeding-programme",
    name: "Seeding Programme",
    description: getTemplate("seeding-programme").description,
    category: "Programmes",
    icon: "🌱",
    needsDomain: null,
    sortOrder: 14,
    parameters: paramsWith(getTemplate("seeding-programme").parameters),
    pitstops: build("seeding-programme", { cohort: 5 }),
  },

  // ── Field Programmes ────────────────────────────────────────────────────────
  {
    slug: "rp-typical-cluster",
    name: "Cluster Work Plan — Typical Cluster",
    description: getTemplate("rp-typical-cluster").description,
    category: "Field Programmes",
    icon: "🏘️",
    needsDomain: null,
    sortOrder: 15,
    parameters: paramsWith(getTemplate("rp-typical-cluster").parameters),
    pitstops: build("rp-typical-cluster", { clusterName: "Cluster", creches: 11 }),
  },
  {
    slug: "rp-base-cluster",
    name: "Cluster Work Plan — Base Cluster",
    description: getTemplate("rp-base-cluster").description,
    category: "Field Programmes",
    icon: "🏚️",
    needsDomain: null,
    sortOrder: 16,
    parameters: paramsWith(getTemplate("rp-base-cluster").parameters),
    pitstops: build("rp-base-cluster", { clusterNames: "Cluster A, Cluster B" }),
  },
  {
    slug: "rp-full-coverage",
    name: "Cluster Work Plan — Full Coverage",
    description: getTemplate("rp-full-coverage").description,
    category: "Field Programmes",
    icon: "🏙️",
    needsDomain: null,
    sortOrder: 17,
    parameters: paramsWith(getTemplate("rp-full-coverage").parameters),
    pitstops: build("rp-full-coverage", { clusterName: "Cluster", childrenCentres: 3, creches: 22 }),
  },

  // ── Zonal Leadership ────────────────────────────────────────────────────────
  {
    slug: "zone-review",
    name: "Zone Review Cadence",
    description: getTemplate("zone-review").description,
    category: "Zonal Leadership",
    icon: "📊",
    needsDomain: null,
    sortOrder: 18,
    parameters: paramsWith(getTemplate("zone-review").parameters),
    pitstops: build("zone-review", { rpCount: 5, reviewFrequency: "Monthly" }),
  },
  {
    slug: "grant-proposal",
    name: "Grant & Proposal Management",
    description: getTemplate("grant-proposal").description,
    category: "Zonal Leadership",
    icon: "📝",
    needsDomain: null,
    sortOrder: 19,
    parameters: withoutParam(getTemplate("grant-proposal").parameters, "track"),
    pitstops: build("grant-proposal", { funderName: "Funder", track: "new" }),
  },
  {
    slug: "grant-proposal-renewal",
    name: "Grant & Proposal Management (Renewal)",
    description: "Renewal or scale-up proposal lifecycle — builds on prior-period outcome data.",
    category: "Zonal Leadership",
    icon: "📝",
    needsDomain: null,
    sortOrder: 20,
    parameters: withoutParam(getTemplate("grant-proposal").parameters, "track"),
    pitstops: build("grant-proposal", { funderName: "Funder", track: "renewal" }),
  },
  {
    slug: "partner-management",
    name: "Partner Relationship Management",
    description: getTemplate("partner-management").description,
    category: "Zonal Leadership",
    icon: "🤝",
    needsDomain: null,
    sortOrder: 21,
    parameters: withoutParam(getTemplate("partner-management").parameters, "track"),
    pitstops: build("partner-management", { partnerCount: 2, track: "new" }),
  },
  {
    slug: "partner-management-existing",
    name: "Partner Relationship Management (Existing)",
    description: "Ongoing management of existing partners — quarterly reviews, audits, and annual health check.",
    category: "Zonal Leadership",
    icon: "🤝",
    needsDomain: null,
    sortOrder: 22,
    parameters: withoutParam(getTemplate("partner-management").parameters, "track"),
    pitstops: build("partner-management", { partnerCount: 2, track: "existing" }),
  },
  {
    slug: "capacity-building",
    name: "Capacity Building Plan",
    description: getTemplate("capacity-building").description,
    category: "Zonal Leadership",
    icon: "🎓",
    needsDomain: null,
    sortOrder: 23,
    parameters: paramsWith(getTemplate("capacity-building").parameters),
    pitstops: build("capacity-building", { rpCount: 5, focus: "all" }),
  },
];

async function main() {
  console.log(`Connecting to DB…`);

  // Wipe existing rows (idempotent re-run)
  const deleted = await prisma.goalTemplateDef.deleteMany({});
  console.log(`Cleared ${deleted.count} existing GoalTemplateDef rows`);

  for (const entry of entries) {
    await prisma.goalTemplateDef.create({
      data: {
        slug: entry.slug,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        icon: entry.icon,
        needsDomain: entry.needsDomain,
        sortOrder: entry.sortOrder,
        parameters: entry.parameters as any,
        pitstops: entry.pitstops as any,
        isActive: true,
      },
    });
    console.log(`  ✓ ${entry.name}`);
  }

  console.log(`\nSeeded ${entries.length} templates.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
