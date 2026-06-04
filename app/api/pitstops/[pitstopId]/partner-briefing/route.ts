import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysOverdue(d: Date | string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function fmtDomain(d: string) {
  return d.replace(/([A-Z])/g, " $1").trim();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session as { user?: { role?: string } }).user?.role ?? "";
  if (role !== "admin" && role !== "super-admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await params; // pitstopId unused — briefing is partner-scoped, pitstop just provides context

  const { partnerId, sinceDate } = await req.json();
  if (!partnerId || !sinceDate) return Response.json({ error: "Missing partnerId or sinceDate" }, { status: 400 });

  const since = new Date(sinceDate);
  const today = new Date();

  // 1. Partner + settlements. Partners are now Org rows (kind="partner");
  // partnerId from the client is the Org id.
  const partner = await prisma.org.findUnique({
    where: { id: partnerId },
    select: {
      id: true, name: true, kind: true,
      settlementsAsPartner: { select: { id: true, name: true } },
    },
  });
  if (!partner || partner.kind !== "partner") {
    return Response.json({ error: "Partner not found" }, { status: 404 });
  }
  const partnerLabel = partner.name;

  const settlementIds = partner.settlementsAsPartner.map((s) => s.id);
  const settlementNameMap = new Map(partner.settlementsAsPartner.map((s) => [s.id, s.name]));

  if (settlementIds.length === 0) {
    return Response.json({ text: `No settlements mapped for ${partnerLabel}.` });
  }

  // 2. Goals in those settlements (raw SQL — completedAt on pitstop is a new column)
  const goalRows = await prisma.$queryRaw<{
    id: string; title: string; status: string; needsDomain: string | null; needsSettlementId: string | null;
  }[]>`
    SELECT id, title, status::text, "needsDomain", "needsSettlementId"
    FROM "Goal"
    WHERE "needsSettlementId" = ANY(${settlementIds})
      AND status::text != 'Archived'
    ORDER BY "needsSettlementId", title
  `;

  const goalIds = goalRows.map((g) => g.id);

  // 3. Pitstops for those goals
  type PitstopRow = {
    id: string; title: string; status: string; targetDate: Date | null;
    completedAt: Date | null; goalId: string;
  };
  const pitstopRows: PitstopRow[] = goalIds.length > 0
    ? await prisma.$queryRaw<PitstopRow[]>`
        SELECT id, title, status::text, "targetDate", "completedAt", "goalId"
        FROM "Pitstop"
        WHERE "goalId" = ANY(${goalIds}) AND "deletedAt" IS NULL
        ORDER BY "order" ASC
      `
    : [];

  const pitstopsByGoal = new Map<string, PitstopRow[]>();
  for (const p of pitstopRows) {
    const arr = pitstopsByGoal.get(p.goalId) ?? [];
    arr.push(p);
    pitstopsByGoal.set(p.goalId, arr);
  }

  // 4. Cancelled + rescheduled activities since sinceDate
  const pitstopIds = pitstopRows.map((p) => p.id);

  type ActivityRow = {
    title: string; scheduledAt: Date; rescheduledFrom: Date | null;
    cancellationReason: string | null; rescheduleReason: string | null; goalTitle: string; status: string;
  };
  const activityRows: ActivityRow[] = pitstopIds.length > 0
    ? await prisma.$queryRaw<ActivityRow[]>`
        SELECT DISTINCT pe.title, pe."scheduledAt", pe."rescheduledFrom",
          pe."cancellationReason", pe."rescheduleReason", g.title as "goalTitle", pe.status::text as status
        FROM "PitstopEvent" pe
        JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
        JOIN "Pitstop" pi ON pi.id = pep."pitstopId"
        JOIN "Goal" g ON g.id = pi."goalId"
        WHERE pep."pitstopId" = ANY(${pitstopIds})
          AND pe.status IN ('Cancelled'::"PitstopEventStatus", 'Rescheduled'::"PitstopEventStatus")
          AND pe."scheduledAt" >= ${since}
          AND pe."deletedAt" IS NULL
        ORDER BY pe."scheduledAt" ASC
      `
    : [];

  // 5. Build text
  const lines: string[] = [];
  const sep = "─".repeat(50);

  lines.push(`PARTNER REVIEW BRIEFING`);
  lines.push(`Partner: ${partnerLabel}`);
  lines.push(`Period: ${fmtDate(since)} — ${fmtDate(today)}`);
  lines.push(`Generated: ${fmtDate(today)}`);
  lines.push(``);
  lines.push(sep);
  lines.push(``);

  if (goalRows.length === 0) {
    lines.push(`No active goals found in ${partnerLabel}'s settlements.`);
  } else {
    lines.push(`GOALS IN ${partnerLabel.toUpperCase()}'S SETTLEMENTS`);
    lines.push(``);

    // Group goals by settlement
    const bySettlement = new Map<string, typeof goalRows>();
    for (const g of goalRows) {
      const sId = g.needsSettlementId ?? "unknown";
      const arr = bySettlement.get(sId) ?? [];
      arr.push(g);
      bySettlement.set(sId, arr);
    }

    for (const [sId, sGoals] of bySettlement) {
      lines.push(settlementNameMap.get(sId) ?? sId);

      for (const g of sGoals) {
        const pitstops = pitstopsByGoal.get(g.id) ?? [];
        const total = pitstops.length;
        const done = pitstops.filter((p) => p.status === "Done").length;
        const overdue = pitstops.filter(
          (p) => p.status !== "Done" && p.status !== "Cancelled" && p.targetDate && new Date(p.targetDate) < today,
        );
        const completedSince = pitstops.filter(
          (p) => p.completedAt && new Date(p.completedAt) >= since,
        );
        const domain = g.needsDomain ? fmtDomain(g.needsDomain) : "General";

        lines.push(`  • ${g.title} [${g.status}]`);
        lines.push(`    Domain: ${domain}`);
        lines.push(`    Progress: ${done} of ${total} pitstops done`);

        if (overdue.length > 0) {
          lines.push(`    Overdue:`);
          for (const p of overdue) {
            const over = daysOverdue(p.targetDate!);
            lines.push(`      - "${p.title}" (due ${fmtDate(p.targetDate!)}, ${over} day${over !== 1 ? "s" : ""} overdue)`);
          }
        }

        if (completedSince.length > 0) {
          lines.push(`    Completed since ${fmtDate(since)}:`);
          for (const p of completedSince) {
            lines.push(`      - "${p.title}" (${fmtDate(p.completedAt!)})`);
          }
        }

        lines.push(``);
      }
    }
  }

  const cancelled = activityRows.filter((a) => a.status === "Cancelled");
  const rescheduled = activityRows.filter((a) => a.status === "Rescheduled");

  if (cancelled.length > 0 || rescheduled.length > 0) {
    lines.push(sep);
    lines.push(``);
    lines.push(`ACTIVITY ISSUES`);
    lines.push(``);

    if (cancelled.length > 0) {
      lines.push(`Cancelled since ${fmtDate(since)}:`);
      for (const a of cancelled) {
        lines.push(`  - "${a.title}" — ${fmtDate(a.scheduledAt)} (Goal: ${a.goalTitle})`);
        if (a.cancellationReason) lines.push(`    Reason: ${a.cancellationReason}`);
      }
      lines.push(``);
    }

    if (rescheduled.length > 0) {
      lines.push(`Rescheduled since ${fmtDate(since)}:`);
      for (const a of rescheduled) {
        const from = a.rescheduledFrom ? fmtDate(a.rescheduledFrom) : "?";
        lines.push(`  - "${a.title}" — moved from ${from} to ${fmtDate(a.scheduledAt)} (Goal: ${a.goalTitle})`);
        if (a.rescheduleReason) lines.push(`    Reason: ${a.rescheduleReason}`);
      }
      lines.push(``);
    }
  }

  lines.push(sep);
  lines.push(`Generated from Pitstops`);

  return Response.json({ text: lines.join("\n"), partnerLabel: partnerLabel });
}
