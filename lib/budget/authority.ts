/**
 * Delegation of authority — the one seam every amount-bearing action passes
 * through.
 *
 * Before this, `'gc'` / `'under_1cr'` only *labelled* the rendered appraisal
 * document (lib/approvals/schema.ts). Operationally, report approval and
 * reallocation approval both gated on `isBudgetAdminOrSuperAdmin`, which means
 * ANY budget admin could approve ANY amount, with no maker-checker and no
 * segregation of duties.
 *
 * Two deliberate design choices:
 *
 * 1. **No matching rule means refusal.** A permissive default would mean the
 *    day someone edits the ruleset badly, the system silently stops checking
 *    rather than loudly stopping. The cost of that choice is that a default
 *    ruleset MUST be seeded (scripts/seed-authority-rules.ts) or every money
 *    route stops — which is the failure you want: visible, immediate, and
 *    fixable by data rather than a deploy.
 *
 * 2. **The verdict is returned, not thrown, by `checkAuthority`.** UI needs to
 *    render "you can't approve this, Priya can" without catching an exception.
 *    `requireAuthority` is the throwing wrapper for write paths.
 *
 * The ruleset is a transcription of the written finance policy, so every rule
 * carries its `policyReference` and every recorded approval carries a snapshot
 * of the rule as it stood — a later edit to the matrix must not change what a
 * past approval meant.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { exceedsCeiling, moneyToString, type MoneyInput } from "./money";

/**
 * The closed vocabulary of authorised actions. Adding one means adding a seeded
 * rule for it too, or that action becomes impossible for everyone.
 */
export const AUTHORITY_ACTIONS = [
  "grant_decision",
  "budget_finalise",
  "report_approve",
  "reallocation_approve",
  "disbursement_approve",
  "condition_waive",
  "closure_close",
  "gate_override",
] as const;

export type AuthorityAction = (typeof AUTHORITY_ACTIONS)[number];

export function isAuthorityAction(v: string): v is AuthorityAction {
  return (AUTHORITY_ACTIONS as readonly string[]).includes(v);
}

export type AuthorityCheck = {
  action: AuthorityAction;
  /** The amount at stake. Omit for actions with no amount (e.g. gate_override). */
  amount?: MoneyInput;
  grantingUnitId?: string | null;
  domain?: string | null;
  /** The grantee org, for the conflict-of-interest check. */
  orgId?: string | null;
  /**
   * Who submitted the thing being approved. When a rule sets
   * `excludeSubmitter`, this person cannot also approve it.
   */
  submittedById?: string | null;
  /** Approver ids already recorded, for multi-approval rules. */
  existingApproverIds?: string[];
};

export type AuthorityVerdict =
  | {
      ok: true;
      ruleId: string;
      /** What the matrix said at the moment it mattered. Store this. */
      snapshot: AuthoritySnapshot;
      /** Further approvals still needed after this one. */
      remainingApprovals: number;
      /** A live `disclose` declaration that must be recorded with the decision. */
      disclosureId?: string;
    }
  | {
      ok: false;
      reason: AuthorityRefusal;
      message: string;
      /** Set where a rule matched but this person is not its holder. */
      ruleId?: string;
      snapshot?: AuthoritySnapshot;
    };

export type AuthorityRefusal =
  | "no_rule"
  | "not_holder"
  | "over_ceiling"
  | "is_submitter"
  | "already_approved"
  | "conflict_recused"
  | "no_session";

export type AuthoritySnapshot = {
  ruleId: string;
  action: string;
  maxAmount: string | null;
  approvalsRequired: number;
  excludeSubmitter: boolean;
  policyReference: string | null;
  grantingUnitId: string | null;
  domain: string | null;
  /** Set when the authority came via a delegation rather than directly. */
  viaDelegationId?: string;
  delegatedFromUserId?: string;
  checkedAt: string;
  amount: string | null;
};

type SessionLike = {
  user?: { id?: string | null; role?: string | null } | null;
} | null;

const RULE_SELECT = {
  id: true,
  action: true,
  grantingUnitId: true,
  domain: true,
  roleId: true,
  userId: true,
  maxAmount: true,
  approvalsRequired: true,
  excludeSubmitter: true,
  priority: true,
  policyReference: true,
} as const;

type RuleRow = Prisma.AuthorityRuleGetPayload<{ select: typeof RULE_SELECT }>;

function snapshotOf(rule: RuleRow, amount: MoneyInput, extra?: Partial<AuthoritySnapshot>): AuthoritySnapshot {
  return {
    ruleId: rule.id,
    action: rule.action,
    maxAmount: rule.maxAmount === null ? null : moneyToString(rule.maxAmount),
    approvalsRequired: rule.approvalsRequired,
    excludeSubmitter: rule.excludeSubmitter,
    policyReference: rule.policyReference,
    grantingUnitId: rule.grantingUnitId,
    domain: rule.domain,
    checkedAt: new Date().toISOString(),
    amount: amount === null || amount === undefined ? null : moneyToString(amount),
    ...extra,
  };
}

/**
 * Resolve the Role rows this user holds.
 *
 * `User.role` is the role NAME (a string), not a foreign key — the app's RBAC
 * joins Role by `name`, which is unique. So an AuthorityRule pointing at a
 * roleId has to be resolved through that name rather than read off the user.
 * The session carries the same name, so it is preferred over a second read
 * when present.
 */
async function resolveUserRoleIds(userId: string, sessionRole?: string | null): Promise<string[]> {
  let roleName = sessionRole ?? null;
  if (!roleName) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    roleName = user?.role ?? null;
  }
  if (!roleName) return [];
  const role = await prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
  return role ? [role.id] : [];
}

/** Delegations that are live today, keyed to the actions they cover. */
async function liveDelegationsTo(userId: string) {
  const today = new Date();
  return prisma.authorityDelegation.findMany({
    where: {
      toUserId: userId,
      isActive: true,
      startsOn: { lte: today },
      endsOn: { gte: today },
    },
    select: { id: true, fromUserId: true, action: true, maxAmount: true },
  });
}

/**
 * A live `recuse` declaration refuses the action outright; a live `disclose`
 * passes but its id is carried into the snapshot, so the decision records the
 * disclosure rather than relying on someone remembering to mention it.
 */
async function conflictFor(userId: string, orgId: string | null | undefined) {
  if (!orgId) return null;
  return prisma.conflictDeclaration.findFirst({
    where: { userId, orgId, endedOn: null },
    select: { id: true, disposition: true, nature: true },
    orderBy: { declaredOn: "desc" },
  });
}

/**
 * Does this person have authority for this action, at this amount, right now?
 *
 * Returns a verdict rather than throwing — see the header. Rules are matched
 * most-specific-first via `priority`, and the FIRST matching rule decides: a
 * later, more generous rule does not rescue an amount the specific rule
 * refuses, because that is how a ceiling is meant to work.
 */
export async function checkAuthority(
  session: SessionLike,
  check: AuthorityCheck,
): Promise<AuthorityVerdict> {
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, reason: "no_session", message: "Not authenticated." };
  }

  const conflict = await conflictFor(userId, check.orgId);
  if (conflict?.disposition === "recuse") {
    return {
      ok: false,
      reason: "conflict_recused",
      message: "You have declared a conflict requiring recusal on this organisation.",
    };
  }

  if (check.existingApproverIds?.includes(userId)) {
    return {
      ok: false,
      reason: "already_approved",
      message: "You have already approved this.",
    };
  }

  const roleIds = await resolveUserRoleIds(userId, session?.user?.role ?? null);
  const delegations = await liveDelegationsTo(userId);
  const delegatorIds = delegations
    .filter((d) => d.action === null || d.action === check.action)
    .map((d) => d.fromUserId);

  // Candidate rules: held by this user, one of their roles, or someone who has
  // delegated to them. Scope null = any, so a unit-scoped rule and a global
  // rule can both match and `priority` picks.
  const rules = await prisma.authorityRule.findMany({
    where: {
      action: check.action,
      isActive: true,
      AND: [
        { OR: [{ grantingUnitId: null }, { grantingUnitId: check.grantingUnitId ?? undefined }] },
        { OR: [{ domain: null }, { domain: check.domain ?? undefined }] },
        {
          OR: [
            { userId },
            ...(roleIds.length ? [{ roleId: { in: roleIds } }] : []),
            ...(delegatorIds.length ? [{ userId: { in: delegatorIds } }] : []),
          ],
        },
      ],
    },
    select: RULE_SELECT,
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  if (!rules.length) {
    // Deliberate: no rule means refusal, not a pass. See the header.
    return {
      ok: false,
      reason: "no_rule",
      message: `No delegation of authority covers ${check.action} at this scope. Ask an administrator to add the rule from the finance policy.`,
    };
  }

  const rule = rules[0];
  const viaDelegation = rule.userId && rule.userId !== userId
    ? delegations.find((d) => d.fromUserId === rule.userId)
    : undefined;

  // A delegate may be capped below the delegator's own ceiling, so both apply.
  const effectiveCeiling =
    viaDelegation?.maxAmount != null && rule.maxAmount != null
      ? (exceedsCeiling(viaDelegation.maxAmount, rule.maxAmount) ? rule.maxAmount : viaDelegation.maxAmount)
      : (viaDelegation?.maxAmount ?? rule.maxAmount);

  const snapshot = snapshotOf(rule, check.amount, viaDelegation
    ? { viaDelegationId: viaDelegation.id, delegatedFromUserId: viaDelegation.fromUserId }
    : undefined);

  if (check.amount !== undefined && exceedsCeiling(check.amount, effectiveCeiling)) {
    return {
      ok: false,
      reason: "over_ceiling",
      message: `This is above your approval limit of ${moneyToString(effectiveCeiling)}.`,
      ruleId: rule.id,
      snapshot,
    };
  }

  if (rule.excludeSubmitter && check.submittedById && check.submittedById === userId) {
    return {
      ok: false,
      reason: "is_submitter",
      message: "You raised this, so someone else must approve it.",
      ruleId: rule.id,
      snapshot,
    };
  }

  const already = check.existingApproverIds?.length ?? 0;
  const remainingApprovals = Math.max(0, rule.approvalsRequired - already - 1);

  return {
    ok: true,
    ruleId: rule.id,
    snapshot,
    remainingApprovals,
    ...(conflict?.disposition === "disclose" ? { disclosureId: conflict.id } : {}),
  };
}

/** Thrown by requireAuthority so callers can distinguish a refusal from a bug. */
export class AuthorityError extends Error {
  readonly reason: AuthorityRefusal;
  constructor(verdict: Extract<AuthorityVerdict, { ok: false }>) {
    super(verdict.message);
    this.name = "AuthorityError";
    this.reason = verdict.reason;
  }
}

/**
 * The write-path wrapper: throws on refusal, returns the verdict on success.
 *
 * Every amount-bearing route calls this from its first commit, even before the
 * real matrix is encoded, so turning the policy on later is a change to the
 * seeded rules rather than a change to twelve call sites.
 */
export async function requireAuthority(
  session: SessionLike,
  check: AuthorityCheck,
): Promise<Extract<AuthorityVerdict, { ok: true }>> {
  const verdict = await checkAuthority(session, check);
  if (!verdict.ok) throw new AuthorityError(verdict);
  return verdict;
}

/**
 * Who *could* approve this, for the "ask someone else" affordance. Returns the
 * holders of every matching rule, so the UI can name them instead of leaving
 * the user stuck at a refusal.
 */
export async function authorityHoldersFor(
  check: Pick<AuthorityCheck, "action" | "amount" | "grantingUnitId" | "domain">,
): Promise<{ userIds: string[]; roleIds: string[] }> {
  const rules = await prisma.authorityRule.findMany({
    where: {
      action: check.action,
      isActive: true,
      AND: [
        { OR: [{ grantingUnitId: null }, { grantingUnitId: check.grantingUnitId ?? undefined }] },
        { OR: [{ domain: null }, { domain: check.domain ?? undefined }] },
      ],
    },
    select: { roleId: true, userId: true, maxAmount: true },
  });
  const eligible = rules.filter((r) => !exceedsCeiling(check.amount, r.maxAmount));
  return {
    userIds: eligible.map((r) => r.userId).filter((v): v is string => !!v),
    roleIds: eligible.map((r) => r.roleId).filter((v): v is string => !!v),
  };
}
