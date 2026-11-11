// Daily cron — statutory registrations about to lapse.
//
// Due diligence captures 12A / 80G / FCRA / CSR-1 as point-in-time answers, so
// nothing has ever noticed an expiry: a registration that lapsed last month
// looks exactly like one renewed last week, and none of the eighteen existing
// crons looked at any of it. This is the one that does.
//
// Scope is deliberately narrow — grantees with a live grant. A lapsed
// registration on a partner nobody funds any more is noise, and a compliance
// digest that cries wolf is one nobody opens twice.
//
// Idempotency: OrgCompliance has no reminder log of its own, so the one-shot
// guard is the AuditLog row this cron writes per (compliance row, state). A
// re-run on the same day finds it and sends nothing.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { expiringCompliance } from "@/lib/budget/compliance";
import { auditLogMany } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await expiringCompliance({ withinDays: 120 });
  if (!rows.length) return Response.json({ ok: true, candidates: 0 });

  // One audit row per (compliance, state) per day is the idempotency key.
  const today = new Date().toISOString().slice(0, 10);
  const already = await prisma.auditLog.findMany({
    where: {
      entityType: "Compliance",
      entityId: { in: rows.map((r) => r.complianceId) },
      action: { startsWith: "expiry_notice" },
      createdAt: { gte: new Date(`${today}T00:00:00.000Z`) },
    },
    select: { entityId: true, action: true },
  });
  const sent = new Set(already.map((a) => `${a.entityId}:${a.action}`));

  const toNotify = rows.filter((r) => !sent.has(`${r.complianceId}:expiry_notice_${r.state}`));
  if (!toNotify.length) {
    return Response.json({ ok: true, candidates: rows.length, notified: 0, reason: "already sent today" });
  }

  auditLogMany(
    toNotify.map((r) => ({
      entityType: "Compliance" as const,
      entityId: r.complianceId,
      userId: "system",
      action: `expiry_notice_${r.state}`,
      field: `${r.orgName}: ${r.label}`,
      oldValue: r.validUntil ? r.validUntil.toISOString().slice(0, 10) : null,
      newValue: r.blocksRelease ? "blocks release" : "warning only",
    })),
  );

  return Response.json({
    ok: true,
    candidates: rows.length,
    notified: toNotify.length,
    // The blocking ones are what a grant lead has to act on this week: an
    // expired FCRA or 12A stops money moving, the rest is paperwork.
    blocking: toNotify.filter((r) => r.blocksRelease).map((r) => ({
      org: r.orgName,
      registration: r.label,
      state: r.state,
      validUntil: r.validUntil,
      daysToExpiry: r.daysToExpiry,
    })),
    warnings: toNotify.filter((r) => !r.blocksRelease).length,
  });
}
