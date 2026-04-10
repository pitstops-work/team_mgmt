/**
 * Onboarding seed: creates accounts for Bangalore team members and applies
 * starter goal templates for each person based on their role.
 *
 * Run with:
 *   DATABASE_URL="..." npx ts-node --project tsconfig.seed.json prisma/seed-onboard-bangalore.ts
 *
 * Temp password for all accounts: Welcome@2025
 * Users should change this on first login.
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { getTemplate } from "../lib/templates";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Roster ──────────────────────────────────────────────────────────────────

const TEMP_PASSWORD = "Welcome@2025";

interface TeamMember {
  name: string;
  email: string;
  goals: GoalSpec[];
}

interface GoalSpec {
  templateId: string;
  title: string;
  description?: string;
  params: Record<string, string | number>;
}

const TEAM: TeamMember[] = [
  {
    name: "Malarvizhi M",
    email: "Malarvizhi.m@azimpremjifoundation.org",
    goals: [], // Zonal lead West + Central — goals to be added later
  },
  {
    name: "Shrinivas",
    email: "shrinivas@azimpremjifoundation.org",
    goals: [
      {
        templateId: "creche-program",
        title: "Creche Programme — Bangalore (Overall)",
        description: "Overall creche programme oversight across Bangalore clusters.",
        params: { creches: 11 }, // update to actual count
      },
    ],
  },
  {
    name: "Umesh Pade",
    email: "umesh.pade@azimpremjifoundation.org",
    goals: [
      {
        templateId: "children-learning-centre",
        title: "Children Work Expansion — Bangalore",
        description: "Expanding children's learning centre coverage across Bangalore.",
        params: { centres: 1 }, // update to actual count
      },
    ],
  },
  {
    name: "Padma G T",
    email: "padma.gt@azimpremjifoundation.org",
    goals: [
      {
        templateId: "rp-typical-cluster",
        title: "RP Work Plan — Peenya West",
        description: "Quarterly work plan for Resource Person, Peenya West cluster.",
        params: { clusterName: "Peenya West", creches: 11 },
      },
    ],
  },
  {
    name: "M Thangam",
    email: "thangam.m@azimpremjifoundation.org",
    goals: [
      {
        templateId: "rp-typical-cluster",
        title: "RP Work Plan — Majestic",
        description: "Quarterly work plan for Resource Person, Majestic cluster.",
        params: { clusterName: "Majestic", creches: 11 },
      },
    ],
  },
  {
    name: "Shiju Joseph",
    email: "shiju.joseph@azimpremjifoundation.org",
    goals: [
      {
        templateId: "rp-typical-cluster",
        title: "RP Work Plan — Yeswanthpur",
        description: "Quarterly work plan for Resource Person, Yeswanthpur cluster.",
        params: { clusterName: "Yeswanthpur", creches: 11 },
      },
    ],
  },
  {
    name: "Abdul Hazimal",
    email: "abdul.hazimal@azimpremjifoundation.org",
    goals: [
      {
        templateId: "creche-program",
        title: "Creche Programme — Abdul's Clusters",
        description: "RP role exclusively focused on creche operations.",
        params: { creches: 11 }, // update to actual count
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createOrGetUser(member: TeamMember): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: member.email } });
  if (existing) {
    console.log(`  ↩ User already exists: ${member.name} <${member.email}>`);
    return existing.id;
  }

  const hashed = await bcrypt.hash(TEMP_PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      name: member.name,
      email: member.email,
      password: hashed,
    },
  });
  console.log(`  ✔ Created user: ${member.name} <${member.email}> (id: ${user.id})`);
  return user.id;
}

async function applyTemplate(userId: string, spec: GoalSpec): Promise<void> {
  const template = getTemplate(spec.templateId);
  if (!template) {
    console.warn(`  ⚠ Template not found: ${spec.templateId}`);
    return;
  }

  const pitstopTemplates = template.build(spec.params);

  // Quarter dates: Q1 FY26-27 = Apr 2026 – Jun 2026
  const goalStart = new Date("2026-04-01");
  const goalTarget = new Date("2026-06-30");

  const validTypes = [
    "Meeting", "Training", "SiteVisit", "Discussion",
    "AppDevelopment", "Budgeting", "Proposal", "Research", "Review", "Custom",
  ];
  const validRecurrences = ["None", "Weekly", "Monthly", "Quarterly"];

  const goal = await prisma.goal.create({
    data: {
      title: spec.title,
      description: spec.description ?? null,
      status: "Active",
      ownerId: userId,
      targetDate: goalTarget,
      pitstops: {
        create: pitstopTemplates.map((pt, idx) => {
          const pitstopStart = new Date(goalStart);
          pitstopStart.setDate(pitstopStart.getDate() + pt.startSlaDays);
          const pitstopTarget = new Date(goalStart);
          pitstopTarget.setDate(pitstopTarget.getDate() + pt.slaDays);

          const pitstopType = validTypes.includes(pt.type) ? pt.type : "Discussion";
          const recurrence = pt.recurrence && validRecurrences.includes(pt.recurrence)
            ? pt.recurrence
            : "None";

          return {
            title: pt.title,
            type: pitstopType as never,
            notes: pt.notes,
            order: idx,
            ownerId: userId,
            ownerInherited: true,
            recurrence: recurrence as never,
            startDate: pitstopStart,
            targetDate: pitstopTarget,
            checklistItems: {
              create: pt.checklist.map((item, itemIdx) => ({
                text: item.text,
                order: itemIdx,
              })),
            },
          };
        }),
      },
    },
  });

  // Auto-follow own goal
  await prisma.goalFollow.upsert({
    where: { userId_goalId: { userId, goalId: goal.id } },
    create: { userId, goalId: goal.id },
    update: {},
  });

  console.log(`    + Goal: "${spec.title}" (${pitstopTemplates.length} pitstops)`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("── Onboarding Bangalore team ────────────────────────────────────\n");
  console.log(`Temp password for all new accounts: ${TEMP_PASSWORD}\n`);

  for (const member of TEAM) {
    console.log(`\n▶ ${member.name}`);
    const userId = await createOrGetUser(member);

    if (member.goals.length === 0) {
      console.log("  (no goals to create)");
      continue;
    }

    for (const spec of member.goals) {
      await applyTemplate(userId, spec);
    }
  }

  console.log("\n── Done ────────────────────────────────────────────────────────");
  console.log("All users can log in with their email and: Welcome@2025");
  console.log("Remind them to change their password after first login.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
