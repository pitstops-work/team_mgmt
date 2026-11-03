/**
 * The partner registry — one identity for a partner organisation, shared by
 * every portal that talks about one.
 *
 * Before this existed, four stores each minted their own partner: `Org`
 * (map/wiki/seeding), `GrantPartner` (budgets), the legacy `MapPartner`, and
 * the review DB's own `orgs` table — with grant notes holding a free-text
 * `org_name` on top of that. The same grantee existed up to four times over,
 * matched only by whatever someone had typed, which is how the review portal
 * ended up with seven spellings of Gubbachi and how a budget could be attached
 * to an approval for a different organisation entirely.
 *
 * `Org` (kind="partner") is now the identity. Everything else *attaches* to it:
 *
 *   Org ─┬─ GrantPartner      one per granting unit — the grant relationship
 *        ├─ GrantPartnerUser  the grantee's login accounts
 *        ├─ OrgAlias          spellings that resolve here
 *        ├─ Settlement / Cluster / LayerFeature / Wiki*   (already on Org)
 *        └─ review DB `orgs.app_org_id`  (see ./reviewMirror.ts)
 *
 * Nothing else may mint a partner. Anywhere a portal used to accept a typed
 * name, it now picks from `listPartners()` or creates through `createPartner()`.
 */

import prisma from "@/lib/prisma";
import { requireGrantingUnit } from "@/lib/budget/grantingUnits";

/**
 * The match key for a partner name: lowercased, everything that isn't a letter
 * or digit removed. Deliberately blunt — it is what makes "Diya Ghar",
 * "diya-ghar" and "DiyaGhar" one key. It does NOT make "Gubbachi NGO" and
 * "Gubbachi" one key: distinct organisations can share a word, so merging
 * spellings is a human judgement recorded in OrgAlias, never an edit-distance
 * guess.
 */
export function normalizePartnerName(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

export function slugifyPartnerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type GrantRelationship = {
  /** GrantPartner.id — what Budget.grantPartnerId points at. */
  id: string;
  grantingUnitId: string | null;
  /** Granting-unit name, as Budget.city still stores it. */
  city: string;
  isActive: boolean;
  budgetCount: number;
};

export type PartnerRecord = {
  /** Org.id — the partner's identity everywhere. */
  id: string;
  name: string;
  slug: string;
  mapKey: string | null;
  color: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  archived: boolean;
  /** One per granting unit this org holds a grant relationship with. */
  grants: GrantRelationship[];
};

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  mapKey: true,
  color: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  notes: true,
  archivedAt: true,
  grantRelationships: {
    select: {
      id: true,
      grantingUnitId: true,
      city: true,
      isActive: true,
      _count: { select: { budgets: true } },
    },
    orderBy: { city: "asc" },
  },
} as const;

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  mapKey: string | null;
  color: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  archivedAt: Date | null;
  grantRelationships: {
    id: string;
    grantingUnitId: string | null;
    city: string;
    isActive: boolean;
    _count: { budgets: number };
  }[];
};

function shape(o: OrgRow): PartnerRecord {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    mapKey: o.mapKey,
    color: o.color ?? "#6366f1",
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    contactEmail: o.contactEmail,
    notes: o.notes,
    archived: !!o.archivedAt,
    grants: o.grantRelationships.map((g) => ({
      id: g.id,
      grantingUnitId: g.grantingUnitId,
      city: g.city,
      isActive: g.isActive,
      budgetCount: g._count.budgets,
    })),
  };
}

/**
 * Every partner, for every picker in every portal.
 *
 * `grantingUnit` narrows to partners holding a grant relationship with that
 * unit — what the budget portal's city tabs want. The other portals pass
 * nothing: due diligence and a grant note are about the organisation, not about
 * which office funds it, and filtering them by unit is how a partner came to be
 * retyped as a new org in the first place.
 */
export async function listPartners(opts?: {
  grantingUnit?: string;
  includeArchived?: boolean;
  /** Only partners that already hold at least one grant relationship. */
  withGrantsOnly?: boolean;
}): Promise<PartnerRecord[]> {
  const rows = (await prisma.org.findMany({
    where: {
      kind: "partner",
      ...(opts?.includeArchived ? {} : { archivedAt: null }),
      ...(opts?.grantingUnit
        ? { grantRelationships: { some: { city: opts.grantingUnit } } }
        : opts?.withGrantsOnly
          ? { grantRelationships: { some: {} } }
          : {}),
    },
    select: ORG_SELECT,
    orderBy: { name: "asc" },
  })) as OrgRow[];
  return rows.map(shape);
}

export async function getPartner(orgId: string): Promise<PartnerRecord | null> {
  const row = (await prisma.org.findFirst({
    where: { id: orgId, kind: "partner" },
    select: ORG_SELECT,
  })) as OrgRow | null;
  return row ? shape(row) : null;
}

export async function requirePartner(orgId: string): Promise<PartnerRecord> {
  const p = await getPartner(orgId);
  if (!p) throw new Error("Unknown partner");
  return p;
}

export type PartnerMatch = {
  partner: PartnerRecord;
  /** How the name was recognised — surfaced so a reviewer can see why. */
  matchedVia: "name" | "slug" | "alias";
};

/**
 * Resolve a typed or imported name to a partner. Exact normalised name first,
 * then slug, then a recorded alias. Returns null rather than guessing — an
 * unresolved name is a question for a human, not a new partner.
 */
export async function resolvePartnerByName(name: string): Promise<PartnerMatch | null> {
  const key = normalizePartnerName(name);
  if (!key) return null;

  const candidates = (await prisma.org.findMany({
    where: { kind: "partner" },
    select: ORG_SELECT,
  })) as OrgRow[];

  const byName = candidates.find((o) => normalizePartnerName(o.name) === key);
  if (byName) return { partner: shape(byName), matchedVia: "name" };

  const bySlug = candidates.find(
    (o) => normalizePartnerName(o.slug) === key || (o.mapKey && normalizePartnerName(o.mapKey) === key),
  );
  if (bySlug) return { partner: shape(bySlug), matchedVia: "slug" };

  const alias = await prisma.orgAlias.findUnique({ where: { normalized: key }, select: { orgId: true } });
  if (alias) {
    const partner = await getPartner(alias.orgId);
    if (partner) return { partner, matchedVia: "alias" };
  }
  return null;
}

/**
 * Teach the registry that a spelling means a partner. Idempotent; a spelling
 * already pointing somewhere else is left alone and reported, because
 * re-pointing one silently would re-attribute whatever already resolved
 * through it.
 */
export async function recordPartnerAlias(
  orgId: string,
  alias: string,
  source?: string,
): Promise<{ ok: boolean; conflictOrgId?: string }> {
  const normalized = normalizePartnerName(alias);
  if (!normalized) return { ok: false };
  const existing = await prisma.orgAlias.findUnique({ where: { normalized }, select: { orgId: true } });
  if (existing) {
    return existing.orgId === orgId ? { ok: true } : { ok: false, conflictOrgId: existing.orgId };
  }
  await prisma.orgAlias.create({ data: { orgId, alias: alias.trim(), normalized, source: source ?? null } });
  return { ok: true };
}

/**
 * Create a partner identity. The only way a new partner comes into existence.
 *
 * Idempotent on the normalised name: a second caller typing the same partner
 * gets the existing one back rather than a second identity, which is the whole
 * point of the registry.
 */
export async function createPartner(input: {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  color?: string | null;
}): Promise<PartnerRecord> {
  const name = input.name.trim();
  if (!name) throw new Error("Partner name required");

  const existing = await resolvePartnerByName(name);
  if (existing) return existing.partner;

  // slug is unique across every Org, internal ones included.
  const base = slugifyPartnerName(name) || "partner";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    if (!(await prisma.org.findUnique({ where: { slug }, select: { id: true } }))) break;
    slug = `${base}-${i}`;
  }

  const created = await prisma.org.create({
    data: {
      name,
      slug,
      kind: "partner",
      color: input.color?.trim() || "#6366f1",
      contactName: input.contactName?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      notes: input.notes?.trim() || null,
      aliases: { create: { alias: name, normalized: normalizePartnerName(name), source: "createPartner" } },
    },
    select: ORG_SELECT,
  });
  return shape(created as OrgRow);
}

/**
 * Rename a partner everywhere at once.
 *
 * The old spelling becomes an alias, so the 33 grant notes and any import that
 * still says the old name keep resolving to the same organisation — a rename
 * must not orphan history. `GrantPartner.name` is a denormalised label, so it
 * is carried along here; nothing reads it for identity.
 */
export async function renamePartner(orgId: string, name: string): Promise<PartnerRecord> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Partner name required");

  const current = await prisma.org.findFirst({
    where: { id: orgId, kind: "partner" },
    select: { name: true },
  });
  if (!current) throw new Error("Unknown partner");

  const clash = await resolvePartnerByName(trimmed);
  if (clash && clash.partner.id !== orgId) {
    throw new Error(`"${trimmed}" already means ${clash.partner.name}. Merge them instead of renaming.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.org.update({ where: { id: orgId }, data: { name: trimmed } });
    await tx.grantPartner.updateMany({ where: { orgId }, data: { name: trimmed } });
    const normalized = normalizePartnerName(trimmed);
    if (normalized && !(await tx.orgAlias.findUnique({ where: { normalized }, select: { id: true } }))) {
      await tx.orgAlias.create({ data: { orgId, alias: trimmed, normalized, source: "renamePartner" } });
    }
    const oldKey = normalizePartnerName(current.name);
    if (oldKey && !(await tx.orgAlias.findUnique({ where: { normalized: oldKey }, select: { id: true } }))) {
      await tx.orgAlias.create({
        data: { orgId, alias: current.name, normalized: oldKey, source: "renamePartner (previous name)" },
      });
    }
  });

  return requirePartner(orgId);
}

/**
 * The partner's grant relationship with one granting unit, created on demand.
 * Idempotent on [grantingUnitId, orgId]; a deactivated relationship is
 * reactivated rather than duplicated.
 */
export async function ensureGrantRelationship(
  orgId: string,
  grantingUnitName: string,
): Promise<{ id: string; city: string }> {
  const partner = await requirePartner(orgId);
  const unit = await requireGrantingUnit(grantingUnitName);

  const existing = await prisma.grantPartner.findUnique({
    where: { grantingUnitId_orgId: { grantingUnitId: unit.id, orgId } },
    select: { id: true, city: true, isActive: true },
  });
  if (existing) {
    if (!existing.isActive) {
      await prisma.grantPartner.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return { id: existing.id, city: existing.city };
  }

  const created = await prisma.grantPartner.create({
    data: { orgId, grantingUnitId: unit.id, city: unit.name, name: partner.name },
    select: { id: true, city: true },
  });
  return created;
}
