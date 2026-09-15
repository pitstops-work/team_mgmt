"use server";

// Outreach writes. Kept out of ../actions.ts so neither file grows unreadable.
// Same conventions: a local access() that throws, one permission check per
// action, a rollup recompute, then one broad revalidate.

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSeedingAccess, canEditGeoOutreach, canSeeLeads } from "@/lib/seeding/access";
import {
  recomputeChannelRollup,
  recomputeOutreachRollup,
  recomputeAllOutreachRollups,
} from "@/lib/seeding/outreachRollup";
import { normaliseName, parseChannelTsv, type ImportResult, type ImportIssue } from "@/lib/seeding/outreach";
import type {
  SeedingChannelKind,
  SeedingChannelStage,
  SeedingSessionKind,
  SeedingLeadStage,
} from "@/app/generated/prisma/client";

async function access() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return { session, a: await getSeedingAccess(session) };
}

function revalidateAll() {
  revalidatePath("/seeding", "layout");
}

const str = (v: string | null | undefined) => (v ?? "").trim() || null;

/** Clamp a hand-entered count: non-negative, integer, and capped so a
 *  fat-finger paste can't blow the funnel by an order of magnitude. */
const REACH_CAP = 100_000;
function count(v: number | null | undefined, cap = REACH_CAP): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(cap, Math.round(v));
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "item";
}

// ── Sub-geos ────────────────────────────────────────────────────────────────

export async function createSeedingSubGeo(geoId: string, label: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No admin access");
  const clean = label.trim();
  if (!clean) throw new Error("Label required");
  const base = slugify(clean);
  // Keys are stable per geo; disambiguate rather than collide.
  const taken = await prisma.seedingSubGeo.findMany({
    where: { geoId, key: { startsWith: base } },
    select: { key: true },
  });
  const keys = new Set(taken.map((t) => t.key));
  let key = base;
  for (let i = 2; keys.has(key); i++) key = `${base}_${i}`;
  const max = await prisma.seedingSubGeo.aggregate({ where: { geoId }, _max: { sortOrder: true } });
  await prisma.seedingSubGeo.create({
    data: { geoId, key, label: clean, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  revalidateAll();
}

export async function updateSeedingSubGeo(id: string, input: { label?: string; notes?: string | null }) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No admin access");
  const data: { label?: string; notes?: string | null } = {};
  if (input.label !== undefined) {
    const clean = input.label.trim();
    if (!clean) throw new Error("Label required");
    data.label = clean;
  }
  if (input.notes !== undefined) data.notes = str(input.notes);
  await prisma.seedingSubGeo.update({ where: { id }, data });
  revalidateAll();
}

export async function archiveSeedingSubGeo(id: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No admin access");
  // Soft delete: channels/sessions keep pointing at it via SetNull only on a
  // hard delete, so archiving preserves the historical tagging.
  await prisma.seedingSubGeo.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidateAll();
}

export async function restoreSeedingSubGeo(id: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No admin access");
  await prisma.seedingSubGeo.update({ where: { id }, data: { archivedAt: null } });
  revalidateAll();
}

export async function reorderSeedingSubGeo(id: string, dir: "up" | "down") {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No admin access");
  const row = await prisma.seedingSubGeo.findUnique({ where: { id }, select: { geoId: true, sortOrder: true } });
  if (!row) throw new Error("Not found");
  const neighbour = await prisma.seedingSubGeo.findFirst({
    where: {
      geoId: row.geoId,
      archivedAt: null,
      sortOrder: dir === "up" ? { lt: row.sortOrder } : { gt: row.sortOrder },
    },
    orderBy: { sortOrder: dir === "up" ? "desc" : "asc" },
    select: { id: true, sortOrder: true },
  });
  if (!neighbour) return;
  await prisma.$transaction([
    prisma.seedingSubGeo.update({ where: { id }, data: { sortOrder: neighbour.sortOrder } }),
    prisma.seedingSubGeo.update({ where: { id: neighbour.id }, data: { sortOrder: row.sortOrder } }),
  ]);
  revalidateAll();
}

// ── Channels ────────────────────────────────────────────────────────────────

export type ChannelInput = {
  name: string;
  kind: SeedingChannelKind;
  subGeoId?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  externalCode?: string | null;
  district?: string | null;
  address?: string | null;
  websiteUrl?: string | null;
  estimatedReach?: number | null;
  orgId?: string | null;
  ownerUserId?: string | null;
  source?: string | null;
  notes?: string | null;
  nextActionAt?: Date | null;
};

function channelData(input: ChannelInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name required");
  return {
    name,
    nameKey: normaliseName(name),
    kind: input.kind,
    subGeoId: input.subGeoId || null,
    contactName: str(input.contactName),
    contactRole: str(input.contactRole),
    contactPhone: str(input.contactPhone),
    contactEmail: str(input.contactEmail),
    externalCode: str(input.externalCode),
    district: str(input.district),
    address: str(input.address),
    websiteUrl: str(input.websiteUrl),
    estimatedReach: input.estimatedReach ? count(input.estimatedReach, 10_000_000) : null,
    orgId: input.orgId || null,
    ownerUserId: input.ownerUserId || null,
    source: str(input.source),
    notes: str(input.notes),
    nextActionAt: input.nextActionAt ?? null,
  };
}

export async function createSeedingChannel(geoId: string | null, input: ChannelInput) {
  const { session, a } = await access();
  if (!canEditGeoOutreach(a, geoId)) throw new Error("No outreach access for this geography");
  const data = channelData(input);
  const clash = await prisma.seedingChannel.findFirst({
    where: { geoId, nameKey: data.nameKey },
    select: { id: true },
  });
  if (clash) throw new Error(`"${data.name}" is already in this directory`);
  await prisma.seedingChannel.create({
    data: { ...data, geoId, createdById: session.user!.id!, origin: "manual" },
  });
  await recomputeOutreachRollup(geoId);
  revalidateAll();
}

export async function updateSeedingChannel(id: string, input: ChannelInput) {
  const { a } = await access();
  const row = await prisma.seedingChannel.findUnique({ where: { id }, select: { geoId: true } });
  if (!row) throw new Error("Not found");
  if (!canEditGeoOutreach(a, row.geoId)) throw new Error("No outreach access for this geography");
  const data = channelData(input);
  const clash = await prisma.seedingChannel.findFirst({
    where: { geoId: row.geoId, nameKey: data.nameKey, id: { not: id } },
    select: { id: true },
  });
  if (clash) throw new Error(`"${data.name}" is already in this directory`);
  await prisma.seedingChannel.update({ where: { id }, data });
  revalidateAll();
}

export async function setSeedingChannelStage(id: string, stage: SeedingChannelStage) {
  const { a } = await access();
  const row = await prisma.seedingChannel.findUnique({
    where: { id },
    select: { geoId: true, firstContactedAt: true, agreedAt: true },
  });
  if (!row) throw new Error("Not found");
  if (!canEditGeoOutreach(a, row.geoId)) throw new Error("No outreach access for this geography");
  const now = new Date();
  await prisma.seedingChannel.update({
    where: { id },
    data: {
      stage,
      // Stamp the first entry into each gate; never overwrite it on a re-entry.
      firstContactedAt:
        row.firstContactedAt ?? (stage === "identified" ? null : now),
      agreedAt: row.agreedAt ?? (stage === "agreed" || stage === "active" ? now : null),
    },
  });
  await recomputeOutreachRollup(row.geoId);
  revalidateAll();
}

export async function archiveSeedingChannel(id: string) {
  const { a } = await access();
  const row = await prisma.seedingChannel.findUnique({ where: { id }, select: { geoId: true } });
  if (!row) throw new Error("Not found");
  if (!canEditGeoOutreach(a, row.geoId)) throw new Error("No outreach access for this geography");
  await prisma.seedingChannel.update({ where: { id }, data: { archivedAt: new Date() } });
  await recomputeOutreachRollup(row.geoId);
  revalidateAll();
}

/**
 * Paste-TSV import. Always re-parses server-side — the client's parse is only a
 * preview. Never updates an existing row: a repeat paste reports skips, so
 * re-pasting the same spreadsheet is safe.
 */
export async function importSeedingChannels(geoId: string | null, tsv: string): Promise<ImportResult> {
  const { session, a } = await access();
  if (!canEditGeoOutreach(a, geoId)) throw new Error("No outreach access for this geography");

  const { rows, errors } = parseChannelTsv(tsv);
  const issues: ImportIssue[] = [...errors];
  if (rows.length === 0) return { created: 0, skipped: 0, errors: issues };

  // Resolve sub-geo labels to ids within this geo (case-insensitive).
  const subGeos = geoId
    ? await prisma.seedingSubGeo.findMany({
        where: { geoId, archivedAt: null },
        select: { id: true, label: true },
      })
    : [];
  const subGeoByLabel = new Map(subGeos.map((s) => [s.label.toLowerCase(), s.id]));

  // Existing keys — the DB unique covers the 4 real geos, but a null geoId is
  // NULL-distinct in Postgres, so central rows need this explicit pre-check.
  const existing = await prisma.seedingChannel.findMany({
    where: { geoId, nameKey: { in: rows.map((r) => r.nameKey) } },
    select: { nameKey: true },
  });
  const taken = new Set(existing.map((e) => e.nameKey));

  const fresh = rows.filter((r) => {
    if (taken.has(r.nameKey)) {
      issues.push({ line: r.line, message: `"${r.name}" is already in the directory — skipped.` });
      return false;
    }
    if (r.subGeoLabel && !subGeoByLabel.has(r.subGeoLabel.toLowerCase())) {
      issues.push({ line: r.line, message: `Unknown sub-geo "${r.subGeoLabel}" — imported without one.` });
    }
    return true;
  });

  if (fresh.length === 0) return { created: 0, skipped: rows.length, errors: issues };

  const result = await prisma.seedingChannel.createMany({
    data: fresh.map((r) => ({
      geoId,
      subGeoId: r.subGeoLabel ? subGeoByLabel.get(r.subGeoLabel.toLowerCase()) ?? null : null,
      kind: r.kind,
      stage: r.stage,
      name: r.name,
      nameKey: r.nameKey,
      district: r.district,
      address: r.address,
      contactName: r.contactName,
      contactRole: r.contactRole,
      contactPhone: r.contactPhone,
      contactEmail: r.contactEmail,
      externalCode: r.externalCode,
      estimatedReach: r.estimatedReach,
      websiteUrl: r.websiteUrl,
      notes: r.notes,
      origin: "import",
      createdById: session.user!.id!,
    })),
    skipDuplicates: true,
  });

  await recomputeOutreachRollup(geoId);
  revalidateAll();
  return { created: result.count, skipped: rows.length - result.count, errors: issues };
}

// ── Sessions ────────────────────────────────────────────────────────────────

export type SessionInput = {
  title: string;
  kind: SeedingSessionKind;
  scheduledAt: Date;
  channelId?: string | null;
  subGeoId?: string | null;
  location?: string | null;
  expectedReach?: number | null;
  ownerUserId?: string | null;
  notes?: string | null;
};

export async function createSeedingSession(geoId: string | null, input: SessionInput) {
  const { session, a } = await access();
  if (!canEditGeoOutreach(a, geoId)) throw new Error("No outreach access for this geography");
  const title = input.title.trim();
  if (!title) throw new Error("Title required");
  await prisma.seedingSession.create({
    data: {
      geoId,
      subGeoId: input.subGeoId || null,
      channelId: input.channelId || null,
      kind: input.kind,
      title,
      scheduledAt: input.scheduledAt,
      originalScheduledAt: input.scheduledAt,
      location: str(input.location),
      expectedReach: input.expectedReach ? count(input.expectedReach) : null,
      ownerUserId: input.ownerUserId || null,
      notes: str(input.notes),
      createdById: session.user!.id!,
    },
  });
  await recomputeOutreachRollup(geoId);
  revalidateAll();
}

export async function updateSeedingSession(id: string, input: SessionInput) {
  const { a } = await access();
  const row = await prisma.seedingSession.findUnique({
    where: { id },
    select: { geoId: true, channelId: true },
  });
  if (!row) throw new Error("Not found");
  if (!canEditGeoOutreach(a, row.geoId)) throw new Error("No outreach access for this geography");
  const title = input.title.trim();
  if (!title) throw new Error("Title required");
  await prisma.seedingSession.update({
    where: { id },
    data: {
      title,
      kind: input.kind,
      // originalScheduledAt is deliberately absent — a reschedule must not
      // launder slippage.
      scheduledAt: input.scheduledAt,
      channelId: input.channelId || null,
      subGeoId: input.subGeoId || null,
      location: str(input.location),
      expectedReach: input.expectedReach ? count(input.expectedReach) : null,
      ownerUserId: input.ownerUserId || null,
      notes: str(input.notes),
    },
  });
  // The channel may have changed — recompute the old one too.
  if (row.channelId) await recomputeChannelRollup(row.channelId);
  if (input.channelId && input.channelId !== row.channelId) await recomputeChannelRollup(input.channelId);
  await recomputeOutreachRollup(row.geoId);
  revalidateAll();
}

/** The main write path: this is what moves the funnel. */
export async function markSeedingSessionHeld(
  id: string,
  input: { heldAt?: Date | null; reachCount: number; leadsCaptured: number; notes?: string | null; proofUrl?: string | null },
) {
  const { a } = await access();
  const row = await prisma.seedingSession.findUnique({
    where: { id },
    select: { geoId: true, channelId: true },
  });
  if (!row) throw new Error("Not found");
  if (!canEditGeoOutreach(a, row.geoId)) throw new Error("No outreach access for this geography");
  const reachCount = count(input.reachCount);
  if (reachCount === 0) throw new Error("A held session needs a reach count — how many people did it put in front of us?");
  const leadsCaptured = Math.min(reachCount, count(input.leadsCaptured));
  await prisma.seedingSession.update({
    where: { id },
    data: {
      status: "held",
      heldAt: input.heldAt ?? new Date(),
      reachCount,
      leadsCaptured,
      notes: str(input.notes),
      proofUrl: str(input.proofUrl),
      cancelledReason: null,
    },
  });
  if (row.channelId) await recomputeChannelRollup(row.channelId);
  await recomputeOutreachRollup(row.geoId);
  revalidateAll();
}

export async function cancelSeedingSession(id: string, reason: string) {
  const { a } = await access();
  const row = await prisma.seedingSession.findUnique({
    where: { id },
    select: { geoId: true, channelId: true },
  });
  if (!row) throw new Error("Not found");
  if (!canEditGeoOutreach(a, row.geoId)) throw new Error("No outreach access for this geography");
  await prisma.seedingSession.update({
    where: { id },
    data: { status: "cancelled", cancelledReason: reason.trim() || null, reachCount: 0, leadsCaptured: 0, heldAt: null },
  });
  if (row.channelId) await recomputeChannelRollup(row.channelId);
  await recomputeOutreachRollup(row.geoId);
  revalidateAll();
}

export async function archiveSeedingSession(id: string) {
  const { a } = await access();
  const row = await prisma.seedingSession.findUnique({
    where: { id },
    select: { geoId: true, channelId: true },
  });
  if (!row) throw new Error("Not found");
  if (!canEditGeoOutreach(a, row.geoId)) throw new Error("No outreach access for this geography");
  await prisma.seedingSession.update({ where: { id }, data: { archivedAt: new Date() } });
  if (row.channelId) await recomputeChannelRollup(row.channelId);
  await recomputeOutreachRollup(row.geoId);
  revalidateAll();
}

// ── Leads (personal data — see canSeeLeads) ─────────────────────────────────

export type LeadInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  ageBand?: string | null;
  occupation?: string | null;
  theme?: string | null;
  interestNote?: string | null;
  channelId?: string | null;
  sessionId?: string | null;
  subGeoId?: string | null;
  ownerUserId?: string | null;
  consentGiven?: boolean;
  nextActionAt?: Date | null;
};

function leadData(input: LeadInput, existingConsentAt: Date | null | undefined) {
  const name = input.name.trim();
  if (!name) throw new Error("Name required");
  const consentAt = input.consentGiven ? existingConsentAt ?? new Date() : null;
  const phone = str(input.phone);
  const email = str(input.email);
  // Contact details are only stored once consent is recorded — the register is
  // for people who agreed to hear from us, not a scraped list.
  if (!consentAt && (phone || email)) {
    throw new Error("Record consent before saving a phone number or email address");
  }
  return {
    name,
    phone,
    email,
    ageBand: str(input.ageBand),
    occupation: str(input.occupation),
    theme: str(input.theme),
    interestNote: str(input.interestNote),
    channelId: input.channelId || null,
    sessionId: input.sessionId || null,
    subGeoId: input.subGeoId || null,
    ownerUserId: input.ownerUserId || null,
    consentAt,
    nextActionAt: input.nextActionAt ?? null,
  };
}

export async function createSeedingLead(geoId: string | null, input: LeadInput) {
  const { session, a } = await access();
  if (!canSeeLeads(a) || !canEditGeoOutreach(a, geoId)) throw new Error("No lead access for this geography");
  await prisma.seedingLead.create({
    data: { ...leadData(input, null), geoId, createdById: session.user!.id! },
  });
  revalidateAll();
}

export async function updateSeedingLead(id: string, input: LeadInput) {
  const { a } = await access();
  const row = await prisma.seedingLead.findUnique({ where: { id }, select: { geoId: true, consentAt: true } });
  if (!row) throw new Error("Not found");
  if (!canSeeLeads(a) || !canEditGeoOutreach(a, row.geoId)) throw new Error("No lead access for this geography");
  await prisma.seedingLead.update({ where: { id }, data: leadData(input, row.consentAt) });
  revalidateAll();
}

export async function setSeedingLeadStage(id: string, stage: SeedingLeadStage) {
  const { a } = await access();
  const row = await prisma.seedingLead.findUnique({ where: { id }, select: { geoId: true, appliedAt: true } });
  if (!row) throw new Error("Not found");
  if (!canSeeLeads(a) || !canEditGeoOutreach(a, row.geoId)) throw new Error("No lead access for this geography");
  await prisma.seedingLead.update({
    where: { id },
    data: { stage, appliedAt: stage === "applied" ? row.appliedAt ?? new Date() : row.appliedAt },
  });
  revalidateAll();
}

export async function archiveSeedingLead(id: string) {
  const { a } = await access();
  const row = await prisma.seedingLead.findUnique({ where: { id }, select: { geoId: true } });
  if (!row) throw new Error("Not found");
  if (!canSeeLeads(a) || !canEditGeoOutreach(a, row.geoId)) throw new Error("No lead access for this geography");
  await prisma.seedingLead.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidateAll();
}

/** Hard delete — the erasure path for a removal request. Central lead only. */
export async function deleteSeedingLead(id: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No admin access");
  await prisma.seedingLead.delete({ where: { id } });
  revalidateAll();
}

// ── Repair ──────────────────────────────────────────────────────────────────

export async function recomputeSeedingOutreach() {
  const { a } = await access();
  if (!a.isCentral) throw new Error("Only central roles can recompute");
  const out = await recomputeAllOutreachRollups();
  revalidateAll();
  return out;
}
