"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import { canLead, canSee, getScreeningAccess, type ScreeningAccess } from "@/lib/seeding/screening/access";
import { L2_DECISIONS, L3_DECISIONS, levelFor, nextState, type Decision } from "@/lib/seeding/screening/decide";
import { kickDrafts } from "@/lib/seeding/screening/draft";
import {
  activeDimensions,
  DEFAULT_KEY,
  rubricFor,
  screeningSettings,
  totalScore,
  type Dimension,
  type Scores,
} from "@/lib/seeding/screening/rubric";

async function screeningAccess(): Promise<ScreeningAccess> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  const s = await getScreeningAccess(await getSeedingAccess(session));
  if (!s) throw new Error("You don't have screening access");
  return s;
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

function refresh(id?: string) {
  revalidatePath("/seeding/screening");
  if (id) revalidatePath(`/seeding/screening/${id}`);
}

async function loadVisible(s: ScreeningAccess, id: string) {
  const app = await prisma.screeningApplication.findUnique({
    where: { id },
    include: { geo: true, reviews: { select: { level: true, reviewerId: true, total: true } } },
  });
  if (!app || !canSee(s, app)) throw new Error("Application not found");
  return app;
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export async function submitReview(input: {
  applicationId: string;
  scores: Scores;
  justification: string;
  decision: Decision;
}): Promise<void> {
  const s = await screeningAccess();
  const app = await loadVisible(s, input.applicationId);
  const level = levelFor(app.status);
  if (!level) throw new Error("This application has been decided. A lead can reopen it.");
  if (level === "l3" && !canLead(s, app.geoId)) throw new Error("Only the geography lead decides at this stage.");
  if (level === "l2" && !(L2_DECISIONS as readonly string[]).includes(input.decision)) throw new Error("Not an L2 decision");
  if (level === "l3" && !(L3_DECISIONS as readonly string[]).includes(input.decision)) throw new Error("Not an L3 decision");

  const justification = input.justification.trim();
  if (justification.length < 10) throw new Error("Write a one-line justification before deciding.");

  const l2 = app.reviews.filter((r) => r.level === "l2");
  if (level === "l2" && app.status === "l2_hold" && l2.some((r) => r.reviewerId === s.userId)) {
    throw new Error("A held application needs a second read by a different screener.");
  }

  const rubric = await rubricFor(app.geo?.key ?? null);
  const dims = activeDimensions(rubric.dimensions, app.isGroup);
  const scores: Scores = {};
  for (const d of dims) {
    const v = Number(input.scores[d.key]);
    if (Number.isInteger(v) && v >= 1 && v <= 5) scores[d.key] = v;
  }
  const complete = dims.every((d) => scores[d.key]);
  // L2 must score everything; the lead may decide on the screeners' scores.
  if (level === "l2" && !complete) throw new Error("Score every dimension before deciding.");
  const total = complete ? totalScore(rubric.dimensions, scores, app.isGroup) : null;

  const settings = await screeningSettings();
  const next = nextState({
    level,
    decision: input.decision,
    status: app.status,
    total,
    priorL2Totals: level === "l2" ? l2.flatMap((r) => (r.total === null ? [] : [r.total])) : [],
    divergence: settings.divergence,
    lowDimension: Object.values(scores).some((v) => v === 1),
    flags: app.flags,
  });

  await prisma.$transaction([
    prisma.screeningReview.create({
      data: {
        applicationId: app.id,
        level,
        reviewerId: s.userId,
        scores: scores as never,
        total,
        rubric: { key: rubric.key, version: rubric.version, dimensions: dims } as never,
        decision: input.decision,
        justification,
      },
    }),
    prisma.screeningApplication.update({ where: { id: app.id }, data: { status: next.status, flags: next.flags } }),
    prisma.screeningEvent.create({
      data: {
        applicationId: app.id,
        actorId: s.userId,
        type: "decision",
        detail: { level, decision: input.decision, total, from: app.status, to: next.status },
      },
    }),
  ]);
  refresh(app.id);
}

// ── Flags, conflicts, reopening ──────────────────────────────────────────────

export async function setFlag(applicationId: string, flag: "red_flag" | "safeguarding", on: boolean, note: string) {
  const s = await screeningAccess();
  const app = await loadVisible(s, applicationId);
  if (!note.trim() && on) throw new Error("Say why.");
  const flags = new Set(app.flags);
  if (on) flags.add(flag);
  else {
    if (!canLead(s, app.geoId)) throw new Error("Only a lead can clear a flag.");
    flags.delete(flag);
  }
  await prisma.$transaction([
    prisma.screeningApplication.update({ where: { id: app.id }, data: { flags: [...flags] } }),
    prisma.screeningEvent.create({
      data: { applicationId: app.id, actorId: s.userId, type: on ? "flag_added" : "flag_cleared", detail: { flag, note } },
    }),
  ]);
  refresh(app.id);
}

/** The person steps away from this application for good; it goes back to the queue for others. */
export async function declareConflict(applicationId: string, note: string) {
  const s = await screeningAccess();
  const app = await loadVisible(s, applicationId);
  await prisma.$transaction([
    prisma.screeningApplication.update({
      where: { id: app.id },
      data: { conflictUserIds: [...new Set([...app.conflictUserIds, s.userId])] },
    }),
    prisma.screeningEvent.create({ data: { applicationId: app.id, actorId: s.userId, type: "conflict", detail: { note } } }),
  ]);
  refresh();
}

export async function reopen(applicationId: string, note: string) {
  const s = await screeningAccess();
  const app = await loadVisible(s, applicationId);
  if (!canLead(s, app.geoId)) throw new Error("Only a lead can reopen an application.");
  if (!note.trim()) throw new Error("Say why.");
  await prisma.$transaction([
    prisma.screeningApplication.update({ where: { id: app.id }, data: { status: "l3_pending" } }),
    prisma.screeningEvent.create({
      data: { applicationId: app.id, actorId: s.userId, type: "reopened", detail: { from: app.status, note } },
    }),
  ]);
  refresh(app.id);
}

export async function redraft(applicationId: string) {
  const s = await screeningAccess();
  const app = await loadVisible(s, applicationId);
  await prisma.screeningApplication.update({
    where: { id: app.id },
    data: { aiStatus: "pending", aiAttempts: 0, aiError: null, aiLockedAt: null, cvText: null },
  });
  const o = await origin();
  after(() => kickDrafts(o));
  refresh(app.id);
}

/** Start drafting anything waiting. Safe to press repeatedly: each application is leased. */
export async function startDrafts() {
  await screeningAccess();
  const o = await origin();
  after(() => kickDrafts(o));
}

// ── Settings ─────────────────────────────────────────────────────────────────

async function configurer() {
  const s = await screeningAccess();
  if (!s.canConfigure) throw new Error("Only programme leads can change screening settings.");
  return s;
}

export async function saveRubric(key: string, dimensions: Dimension[], guidance: string) {
  const s = await configurer();
  if (key !== DEFAULT_KEY && !(await prisma.seedingGeo.findUnique({ where: { key } }))) throw new Error("Unknown geography");
  const seen = new Set<string>();
  const clean: Dimension[] = [];
  for (const d of dimensions) {
    const k = String(d.key || d.label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    if (!k || seen.has(k)) throw new Error(`Each dimension needs a distinct name ("${d.label}").`);
    seen.add(k);
    const weight = Math.max(0, Math.round(Number(d.weight) || 0));
    const groupWeight = Math.max(0, Math.round(Number(d.groupWeight) || 0));
    clean.push({
      key: k,
      label: String(d.label || "").trim().slice(0, 80) || k,
      description: String(d.description || "").trim().slice(0, 600),
      weight: d.groupOnly ? 0 : weight,
      groupWeight,
      groupOnly: d.groupOnly === true,
      anchors: {
        "1": String(d.anchors?.["1"] || "").trim().slice(0, 400),
        "3": String(d.anchors?.["3"] || "").trim().slice(0, 400),
        "5": String(d.anchors?.["5"] || "").trim().slice(0, 400),
      },
    });
  }
  const individual = clean.filter((d) => !d.groupOnly && d.weight > 0);
  if (individual.length < 3) throw new Error("A rubric needs at least three weighted dimensions.");
  if (clean.length > 10) throw new Error("Ten dimensions at most — the profile chart stops being readable beyond that.");

  const prev = await prisma.screeningRubric.findUnique({ where: { key } });
  await prisma.screeningRubric.upsert({
    where: { key },
    create: { key, dimensions: clean as never, guidance: guidance.slice(0, 4000), updatedById: s.userId },
    update: {
      dimensions: clean as never,
      guidance: guidance.slice(0, 4000),
      version: { increment: 1 },
      updatedById: s.userId,
    },
  });
  await prisma.screeningEvent.create({
    data: {
      actorId: s.userId,
      type: "rubric_changed",
      detail: { key, fromVersion: prev?.version ?? 0, dimensions: clean, guidance } as never,
    },
  });
  revalidatePath("/seeding/screening", "layout");
}

/** Drop a geography's own rubric; it falls back to the default. */
export async function removeGeoRubric(key: string) {
  const s = await configurer();
  if (key === DEFAULT_KEY) throw new Error("The default rubric can't be removed.");
  await prisma.screeningRubric.deleteMany({ where: { key } });
  await prisma.screeningEvent.create({ data: { actorId: s.userId, type: "rubric_removed", detail: { key } } });
  revalidatePath("/seeding/screening", "layout");
}

export async function saveSettings(input: {
  advanceMin: number;
  holdMin: number;
  divergence: number;
  dailyCap: number;
  aiEnabled: boolean;
}) {
  const s = await configurer();
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));
  const data = {
    advanceMin: clamp(input.advanceMin, 1, 100),
    holdMin: clamp(input.holdMin, 0, 100),
    divergence: clamp(input.divergence, 1, 100),
    dailyCap: clamp(input.dailyCap, 1, 500),
    aiEnabled: input.aiEnabled === true,
  };
  if (data.holdMin >= data.advanceMin) throw new Error("The hold band must start below the advance band.");
  await prisma.screeningSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await prisma.screeningEvent.create({ data: { actorId: s.userId, type: "settings_changed", detail: data } });
  revalidatePath("/seeding/screening", "layout");
}

export async function saveScope(userId: string, geoId: string, districts: string[]) {
  const s = await configurer();
  const clean = [...new Set(districts.map((d) => d.trim()).filter(Boolean))];
  if (clean.length === 0) await prisma.screeningScope.deleteMany({ where: { userId, geoId } });
  else
    await prisma.screeningScope.upsert({
      where: { userId_geoId: { userId, geoId } },
      create: { userId, geoId, districts: clean },
      update: { districts: clean },
    });
  await prisma.screeningEvent.create({ data: { actorId: s.userId, type: "scope_changed", detail: { userId, geoId, districts: clean } } });
  revalidatePath("/seeding/screening/settings");
}
