/**
 * The compliance calendar.
 *
 * Due diligence already captures 12A / 80G / FCRA / CSR-1 — as point-in-time
 * answers in JSON. So the system knows a certificate was seen once and has no
 * idea whether it is still valid: an FCRA registration that lapsed last month
 * looks exactly like one renewed last week, and nothing surfaces either. There
 * was no cron among the eighteen that looked at any of it.
 *
 * What makes this different from the JSON it supplements is the validity
 * WINDOW, plus a per-kind decision about whether an expiry merely warns or
 * actually blocks a release (`ComplianceKindConfig.blocksRelease`, read by
 * `releaseGate()`).
 *
 * A null `validUntil` means NO EXPIRY — a PAN does not lapse — not "unknown".
 * Treating null as unknown would either block every grantee with a PAN or warn
 * about all of them forever; the distinction is why `isRequired` and
 * `validUntil` are separate columns.
 */

import prisma from "@/lib/prisma";
import { logGrant } from "./audit";

/** The registrations the Indian regulatory picture actually turns on. */
export const DEFAULT_COMPLIANCE_KINDS: {
  kind: string;
  label: string;
  blocksRelease: boolean;
  isRequired: boolean;
  warnDays: number;
  note?: string;
}[] = [
  {
    kind: "reg_12a",
    label: "12A registration",
    blocksRelease: true,
    isRequired: true,
    warnDays: 90,
    note: "Income-tax exemption. Without it the grantee's receipt is taxable income.",
  },
  {
    kind: "reg_80g",
    label: "80G certificate",
    blocksRelease: false,
    isRequired: true,
    warnDays: 90,
    note: "Donor-side deduction. Affects the funder's own position, not the grantee's ability to receive.",
  },
  {
    kind: "fcra",
    label: "FCRA registration",
    blocksRelease: true,
    isRequired: false,
    warnDays: 120,
    note: "Only where foreign funds are involved; where it applies, a lapse makes receipt unlawful.",
  },
  {
    kind: "csr1",
    label: "CSR-1 registration",
    blocksRelease: true,
    isRequired: false,
    warnDays: 90,
    note: "Required to receive CSR money. Form CSR-1 filing with the MCA.",
  },
  { kind: "pan", label: "PAN", blocksRelease: true, isRequired: true, warnDays: 0, note: "Never expires." },
  { kind: "tan", label: "TAN", blocksRelease: false, isRequired: false, warnDays: 0 },
  { kind: "gst", label: "GST registration", blocksRelease: false, isRequired: false, warnDays: 60 },
  {
    kind: "audited_accounts",
    label: "Audited accounts",
    blocksRelease: false,
    isRequired: true,
    warnDays: 60,
    note: "Rolls annually; a grantee more than one year behind is a finding.",
  },
  { kind: "darpan", label: "NGO Darpan ID", blocksRelease: false, isRequired: false, warnDays: 0 },
  { kind: "trust_deed", label: "Trust deed / MoA", blocksRelease: false, isRequired: true, warnDays: 0 },
  {
    kind: "form_10bd",
    label: "Form 10BD filing",
    blocksRelease: false,
    isRequired: false,
    warnDays: 45,
    note: "Annual statement of donations received; 10BE certificates follow from it.",
  },
];

export type ComplianceState = "valid" | "expiring" | "expired" | "missing" | "no_expiry";

export type ComplianceRow = {
  kind: string;
  label: string;
  identifier: string | null;
  issuedOn: Date | null;
  validUntil: Date | null;
  state: ComplianceState;
  daysToExpiry: number | null;
  blocksRelease: boolean;
  isRequired: boolean;
};

function stateOf(
  validUntil: Date | null,
  warnDays: number,
  now: Date,
): { state: ComplianceState; daysToExpiry: number | null } {
  if (!validUntil) return { state: "no_expiry", daysToExpiry: null };
  const days = Math.floor((validUntil.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { state: "expired", daysToExpiry: days };
  if (warnDays > 0 && days <= warnDays) return { state: "expiring", daysToExpiry: days };
  return { state: "valid", daysToExpiry: days };
}

/**
 * The full picture for one grantee: every configured kind, whether the grantee
 * holds it, and where it stands. Returns configured-but-absent kinds as
 * `missing` rather than omitting them — the absence is the finding.
 */
export async function complianceFor(orgId: string, now = new Date()): Promise<ComplianceRow[]> {
  const [configs, held] = await Promise.all([
    prisma.complianceKindConfig.findMany({
      where: { isActive: true },
      orderBy: { kind: "asc" },
    }),
    prisma.orgCompliance.findMany({ where: { orgId } }),
  ]);

  const byKind = new Map(held.map((h) => [h.kind, h]));
  return configs.map((c) => {
    const row = byKind.get(c.kind);
    if (!row) {
      return {
        kind: c.kind,
        label: c.label,
        identifier: null,
        issuedOn: null,
        validUntil: null,
        state: "missing" as const,
        daysToExpiry: null,
        blocksRelease: c.blocksRelease,
        isRequired: c.isRequired,
      };
    }
    const { state, daysToExpiry } = stateOf(row.validUntil, c.warnDays, now);
    return {
      kind: c.kind,
      label: c.label,
      identifier: row.identifier,
      issuedOn: row.issuedOn,
      validUntil: row.validUntil,
      state,
      daysToExpiry,
      blocksRelease: c.blocksRelease,
      isRequired: c.isRequired,
    };
  });
}

export async function upsertCompliance(
  session: { user?: { id?: string | null } | null } | null,
  input: {
    orgId: string;
    kind: string;
    identifier?: string | null;
    issuedOn?: Date | null;
    validUntil?: Date | null;
    note?: string | null;
    verified?: boolean;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  if (input.issuedOn && input.validUntil && input.validUntil < input.issuedOn) {
    throw new Error("A registration cannot expire before it was issued.");
  }

  const before = await prisma.orgCompliance.findUnique({
    where: { orgId_kind: { orgId: input.orgId, kind: input.kind } },
    select: { validUntil: true, identifier: true },
  });

  const row = await prisma.orgCompliance.upsert({
    where: { orgId_kind: { orgId: input.orgId, kind: input.kind } },
    create: {
      orgId: input.orgId,
      kind: input.kind,
      identifier: input.identifier ?? null,
      issuedOn: input.issuedOn ?? null,
      validUntil: input.validUntil ?? null,
      note: input.note ?? null,
      verifiedById: input.verified ? userId : null,
      verifiedAt: input.verified ? new Date() : null,
    },
    update: {
      identifier: input.identifier ?? null,
      issuedOn: input.issuedOn ?? null,
      validUntil: input.validUntil ?? null,
      note: input.note ?? null,
      ...(input.verified ? { verifiedById: userId, verifiedAt: new Date() } : {}),
    },
    select: { id: true },
  });

  logGrant("Compliance", row.id, userId, "recorded", {
    field: `${input.kind}${input.identifier ? ` (${input.identifier})` : ""}`,
    from: before?.validUntil?.toISOString().slice(0, 10) ?? null,
    to: input.validUntil?.toISOString().slice(0, 10) ?? "no expiry",
  });

  return row;
}

/**
 * Everything expiring or expired across the portfolio — what the cron reads.
 *
 * Scoped to orgs that actually have a live grant: a lapsed registration on a
 * partner nobody funds any more is noise, and noise is why nobody reads a
 * compliance dashboard twice.
 */
export async function expiringCompliance(opts: { withinDays?: number } = {}) {
  const within = opts.withinDays ?? 90;
  const horizon = new Date(Date.now() + within * 86_400_000);

  const rows = await prisma.orgCompliance.findMany({
    where: {
      validUntil: { not: null, lte: horizon },
      org: {
        grantRelationships: {
          some: { budgets: { some: { status: { in: ["approved", "final"] } } } },
        },
      },
    },
    select: {
      id: true,
      kind: true,
      validUntil: true,
      identifier: true,
      org: { select: { id: true, name: true } },
    },
    orderBy: { validUntil: "asc" },
  });

  const configs = await prisma.complianceKindConfig.findMany({
    where: { isActive: true },
    select: { kind: true, label: true, warnDays: true, blocksRelease: true },
  });
  const byKind = new Map(configs.map((c) => [c.kind, c]));
  const now = new Date();

  return rows
    .map((r) => {
      const cfg = byKind.get(r.kind);
      if (!cfg) return null;
      const { state, daysToExpiry } = stateOf(r.validUntil, cfg.warnDays, now);
      if (state !== "expiring" && state !== "expired") return null;
      return {
        complianceId: r.id,
        orgId: r.org.id,
        orgName: r.org.name,
        kind: r.kind,
        label: cfg.label,
        identifier: r.identifier,
        validUntil: r.validUntil,
        state,
        daysToExpiry,
        blocksRelease: cfg.blocksRelease,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * Seed the kind configuration. Idempotent upsert, because the set grows as the
 * regulatory picture changes and re-running must not reset what an admin tuned.
 */
export async function seedComplianceKinds() {
  for (const k of DEFAULT_COMPLIANCE_KINDS) {
    await prisma.complianceKindConfig.upsert({
      where: { kind: k.kind },
      create: k,
      // Only the label and note are refreshed: blocksRelease / warnDays are
      // policy an admin may have deliberately changed.
      update: { label: k.label, note: k.note ?? null },
    });
  }
  return DEFAULT_COMPLIANCE_KINDS.length;
}
