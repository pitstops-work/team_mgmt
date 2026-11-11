/**
 * Seeds the delegation-of-authority ruleset and the compliance kind config.
 *
 * WHY THIS MUST RUN: `requireAuthority()` refuses when no rule matches. That is
 * deliberate — a permissive default would mean a bad edit to the ruleset
 * silently stops the system checking rather than loudly stopping it — but it
 * also means that until this script has run, every amount-bearing route refuses.
 * Run it in the same change as the migration.
 *
 * WHAT THIS RULESET IS: a PLACEHOLDER that mirrors today's behaviour, not the
 * organisation's actual policy. Today any budget admin can approve any amount
 * (`isBudgetAdminOrSuperAdmin`), so the starting rules reproduce that, plus the
 * ₹1 Cr board threshold the appraisal tiers already imply. Nothing is tightened
 * silently: the point is to change behaviour only when someone deliberately
 * encodes the written finance policy, clause by clause, with
 * `policyReference` filled in on every row.
 *
 * The BANDS below are read from the legacy system's own workflow states, which
 * name them outright: "Debrief (for under 1 Cr)" and "Board Review (above
 * ₹10 Cr)", with a GC Review step between. So there are THREE bands, not two —
 * an earlier draft of this script had ₹1 Cr as the board threshold, which is
 * the BOTTOM of the middle band rather than the top.
 *
 * The open question remains whether a band applies to the grant total or to the
 * annual outflow. They differ for a multi-year grant and the difference decides
 * which grants reach the board, so do not treat these rows as settled policy
 * until that is confirmed and `policyReference` is filled in from the written
 * finance policy.
 *
 * Run (dry run first, always — .env.local points at PRODUCTION):
 *   set -a && source .env.local && set +a && npx tsx scripts/seed-authority-rules.ts
 *   set -a && source .env.local && set +a && npx tsx scripts/seed-authority-rules.ts --apply
 */

import { AUTHORITY_ACTIONS, type AuthorityAction } from "../lib/budget/authority";

/**
 * Band ceilings, from the legacy workflow's own state names (see the header).
 * DELEGATED_CEILING is where "under 1 Cr" stops; above BOARD_THRESHOLD the
 * board sees it; between the two sits the grants committee.
 */
const DELEGATED_CEILING = 1_00_00_000; // ₹1 Cr
const BOARD_THRESHOLD = 10_00_00_000; // ₹10 Cr

type SeedRule = {
  action: AuthorityAction;
  roleName: string;
  maxAmount: number | null;
  approvalsRequired: number;
  excludeSubmitter: boolean;
  priority: number;
  note: string;
};

/**
 * Mirrors current behaviour. Every row is deliberately permissive, because
 * tightening authority as a side effect of a migration would lock people out of
 * work they are doing today.
 */
const SEED_RULES: SeedRule[] = [
  {
    action: "grant_decision",
    roleName: "super-admin",
    maxAmount: null,
    approvalsRequired: 1,
    excludeSubmitter: false,
    priority: 10,
    note: "PLACEHOLDER: unlimited, mirrors today. Replace with the board's own authority.",
  },
  {
    action: "grant_decision",
    roleName: "budget-admin",
    maxAmount: DELEGATED_CEILING,
    approvalsRequired: 1,
    excludeSubmitter: false,
    priority: 20,
    note: "PLACEHOLDER: the delegated band, under ₹1 Cr. Above this the grants committee sees it, and above ₹10 Cr the board does — neither forum is seeded here, because neither is a role in this app yet. Confirm per grant vs per year.",
  },
  ...(["budget_finalise", "report_approve", "reallocation_approve"] as const).flatMap(
    (action): SeedRule[] => [
      {
        action,
        roleName: "super-admin",
        maxAmount: null,
        approvalsRequired: 1,
        excludeSubmitter: false,
        priority: 10,
        note: "PLACEHOLDER: mirrors isBudgetAdminOrSuperAdmin today.",
      },
      {
        action,
        roleName: "budget-admin",
        maxAmount: null,
        approvalsRequired: 1,
        excludeSubmitter: false,
        priority: 20,
        note: "PLACEHOLDER: mirrors isBudgetAdminOrSuperAdmin today — any admin, any amount.",
      },
    ],
  ),
  {
    action: "disbursement_approve",
    roleName: "super-admin",
    maxAmount: null,
    approvalsRequired: 1,
    excludeSubmitter: true,
    priority: 10,
    note: "NEW capability — no prior behaviour to mirror. Maker-checker on by default.",
  },
  {
    action: "disbursement_approve",
    roleName: "budget-admin",
    maxAmount: BOARD_THRESHOLD,
    approvalsRequired: 1,
    excludeSubmitter: true,
    priority: 20,
    note: "NEW capability. Maker-checker on: whoever raised the request cannot approve it. Releasing against an already-approved grant is not a second approval of the grant, so this ceiling is the board threshold rather than the delegated one.",
  },
  {
    action: "condition_waive",
    roleName: "super-admin",
    maxAmount: null,
    approvalsRequired: 1,
    excludeSubmitter: true,
    priority: 10,
    note: "Waiving a pre-disbursement condition is approving money without appearing to — kept narrow on purpose.",
  },
  {
    action: "closure_close",
    roleName: "super-admin",
    maxAmount: null,
    approvalsRequired: 1,
    excludeSubmitter: false,
    priority: 10,
    note: "PLACEHOLDER.",
  },
  {
    action: "closure_close",
    roleName: "budget-admin",
    maxAmount: null,
    approvalsRequired: 1,
    excludeSubmitter: false,
    priority: 20,
    note: "PLACEHOLDER.",
  },
  {
    action: "gate_override",
    roleName: "super-admin",
    maxAmount: null,
    approvalsRequired: 1,
    excludeSubmitter: true,
    priority: 10,
    note: "Pushing past a release gate. Deliberately narrower than approving a release.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  // Imported inside main(): ESM hoists a top-level import above any
  // dotenv.config() the runner does, so the client would connect before
  // DATABASE_URL exists and fail with ECONNREFUSED.
  const { default: prisma } = await import("../lib/prisma");
  const { seedComplianceKinds } = await import("../lib/budget/compliance");

  const roleNames = [...new Set(SEED_RULES.map((r) => r.roleName))];
  const roles = await prisma.role.findMany({
    where: { name: { in: roleNames } },
    select: { id: true, name: true },
  });
  const roleByName = new Map(roles.map((r) => [r.name, r.id]));

  const missing = roleNames.filter((n) => !roleByName.has(n));
  if (missing.length) {
    console.error(`[seed-authority] missing roles: ${missing.join(", ")} — seed roles first.`);
    process.exit(1);
  }

  const existing = await prisma.authorityRule.findMany({
    select: { id: true, action: true, roleId: true, maxAmount: true, policyReference: true },
  });

  // Anything with a policyReference was transcribed from the real policy by a
  // person. This script must never touch those rows.
  const encoded = existing.filter((r) => r.policyReference);
  if (encoded.length) {
    console.log(
      `[seed-authority] ${encoded.length} rule(s) already carry a policyReference — leaving them alone.`,
    );
  }

  const plan: { action: string; roleName: string; maxAmount: number | null; exists: boolean }[] = [];
  for (const rule of SEED_RULES) {
    const roleId = roleByName.get(rule.roleName)!;
    const already = existing.some(
      (e) => e.action === rule.action && e.roleId === roleId && !e.policyReference,
    );
    plan.push({ action: rule.action, roleName: rule.roleName, maxAmount: rule.maxAmount, exists: already });
  }

  console.log(`[seed-authority] actions in vocabulary: ${AUTHORITY_ACTIONS.join(", ")}`);
  console.log(`[seed-authority] ${plan.filter((p) => !p.exists).length} rule(s) to create, ${plan.filter((p) => p.exists).length} already present`);
  for (const p of plan) {
    const ceiling = p.maxAmount === null ? "unlimited" : `₹${p.maxAmount.toLocaleString("en-IN")}`;
    console.log(`  ${p.exists ? "skip  " : "create"} ${p.action.padEnd(22)} ${p.roleName.padEnd(14)} ${ceiling}`);
  }

  // Actions with no rule at all are a hard stop in production: that action
  // becomes impossible for everyone.
  const covered = new Set(SEED_RULES.map((r) => r.action));
  const uncovered = AUTHORITY_ACTIONS.filter((a) => !covered.has(a));
  if (uncovered.length) {
    console.warn(
      `[seed-authority] WARNING: no seeded rule for ${uncovered.join(", ")} — those actions will refuse for everyone until a rule exists.`,
    );
  }

  if (!apply) {
    console.log("[seed-authority] DRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  let created = 0;
  for (const rule of SEED_RULES) {
    const roleId = roleByName.get(rule.roleName)!;
    const already = existing.some(
      (e) => e.action === rule.action && e.roleId === roleId && !e.policyReference,
    );
    if (already) continue;
    await prisma.authorityRule.create({
      data: {
        action: rule.action,
        roleId,
        maxAmount: rule.maxAmount,
        approvalsRequired: rule.approvalsRequired,
        excludeSubmitter: rule.excludeSubmitter,
        priority: rule.priority,
        note: rule.note,
        // Left NULL on purpose: these are placeholders, and the empty column is
        // the signal that nobody has encoded the real clause yet.
        policyReference: null,
      },
    });
    created++;
  }

  const kinds = await seedComplianceKinds();
  console.log(`[seed-authority] created ${created} rule(s); ${kinds} compliance kind(s) ensured.`);
  console.log("[seed-authority] done.");
}

main()
  .catch((err) => {
    console.error("[seed-authority] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    // Not .finally(() => process.exit(0)) — that swallows a failure and reports
    // it as success.
    const { default: prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
