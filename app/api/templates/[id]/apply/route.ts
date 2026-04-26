import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DbPitstop, interpolatePitstops } from "@/lib/templateDb";
import {
  buildScheduleConfig,
  getWorkingDays,
  nearestWorkingDay,
  distributeAcrossDays,
  pitstopTypeToEventType,
} from "@/lib/scheduleActivities";

async function resolveCityName(
  needsCityId?: string | null,
  needsZoneId?: string | null,
  needsClusterId?: string | null,
  needsSettlementId?: string | null,
): Promise<string | null> {
  if (needsCityId) {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM "City" WHERE id = ${needsCityId} LIMIT 1
    `;
    return rows[0]?.name ?? null;
  }
  if (needsSettlementId) {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT c.name FROM "City" c
      JOIN "Settlement" s ON s."cityId" = c.id
      WHERE s.id = ${needsSettlementId} LIMIT 1
    `;
    return rows[0]?.name ?? null;
  }
  if (needsClusterId) {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT c.name FROM "City" c
      JOIN "Zone" z ON z."cityId" = c.id
      JOIN "Cluster" cl ON cl."zoneId" = z.id
      WHERE cl.id = ${needsClusterId} LIMIT 1
    `;
    return rows[0]?.name ?? null;
  }
  if (needsZoneId) {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT c.name FROM "City" c
      JOIN "Zone" z ON z."cityId" = c.id
      WHERE z.id = ${needsZoneId} LIMIT 1
    `;
    return rows[0]?.name ?? null;
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const rows = await prisma.$queryRaw<{ pitstops: unknown }[]>`
    SELECT pitstops FROM "GoalTemplateDef"
    WHERE slug = ${id} AND "isActive" = true
    LIMIT 1
  `;
  if (!rows[0]) return Response.json({ error: "Template not found" }, { status: 404 });

  const body = await req.json();
  const {
    title, description, targetDate, startDate, params: templateParams,
    needsDomain, needsSettlementId, needsClusterId, needsZoneId, needsCityId,
    ownerId,
  } = body;

  if (!title) return Response.json({ error: "Title required" }, { status: 400 });
  if (!startDate) return Response.json({ error: "Start date required" }, { status: 400 });

  const rawPitstops = rows[0].pitstops as DbPitstop[];
  const pitstopTemplates = interpolatePitstops(rawPitstops, templateParams ?? {});
  const goalStart = new Date(startDate);
  const goalOwnerId = ownerId ?? session.user.id;

  const resolvedTargetDate = targetDate
    ? new Date(targetDate)
    : (() => {
        const maxSla = pitstopTemplates.length > 0
          ? Math.max(...pitstopTemplates.map((pt) => pt.slaDays))
          : 365;
        const d = new Date(goalStart);
        d.setDate(d.getDate() + maxSla);
        return d;
      })();

  const goal = await prisma.goal.create({
    data: {
      title,
      description: description ?? null,
      status: "Active",
      ownerId: goalOwnerId,
      targetDate: resolvedTargetDate,
      needsDomain: needsDomain ?? null,
      needsSettlementId: needsSettlementId ?? null,
      needsClusterId: needsClusterId ?? null,
      needsZoneId: needsZoneId ?? null,
      needsCityId: needsCityId ?? null,
      pitstops: {
        create: pitstopTemplates.map((pt, idx) => {
          const pitstopStart = new Date(goalStart);
          pitstopStart.setDate(pitstopStart.getDate() + pt.startSlaDays);
          const pitstopTarget = new Date(goalStart);
          pitstopTarget.setDate(pitstopTarget.getDate() + pt.slaDays);

          const validTypes = [
            "Meeting", "Training", "SiteVisit", "Discussion",
            "AppDevelopment", "Budgeting", "Proposal", "Research", "Review", "Custom",
          ];
          const pitstopType = validTypes.includes(pt.type) ? pt.type : "Discussion";

          const validRecurrences = ["None", "Weekly", "Monthly", "Quarterly"];
          const recurrence = pt.recurrence && validRecurrences.includes(pt.recurrence) ? pt.recurrence : "None";

          return {
            title: pt.title,
            type: pitstopType as any,
            notes: pt.notes,
            order: idx,
            ownerId: goalOwnerId,
            ownerInherited: true,
            recurrence: recurrence as any,
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
    include: {
      owner: { select: { id: true, name: true, image: true } },
      pitstops: { select: { id: true, status: true } },
    },
  });

  // Fetch pitstops in template order — Prisma include does not guarantee insertion order
  const pitstopsOrdered = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Pitstop"
    WHERE "goalId" = ${goal.id} AND "deletedAt" IS NULL
    ORDER BY "order" ASC
  `;

  // Set progressTag on pitstops
  for (let idx = 0; idx < pitstopTemplates.length; idx++) {
    const tag = pitstopTemplates[idx]?.progressTag ?? null;
    const pitstop = pitstopsOrdered[idx];
    if (!pitstop) continue;
    await prisma.$executeRaw`
      UPDATE "Pitstop" SET "progressTag" = ${tag} WHERE id = ${pitstop.id}
    `;
  }

  // Set completionType on checklist items (Activity is the default; only non-Activity types need updating)
  for (let piIdx = 0; piIdx < pitstopTemplates.length; piIdx++) {
    const pitstop = pitstopsOrdered[piIdx];
    if (!pitstop) continue;
    const pt = pitstopTemplates[piIdx];
    const ciIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ChecklistItem" WHERE "pitstopId" = ${pitstop.id} ORDER BY "order" ASC
    `;
    for (let ciIdx = 0; ciIdx < pt.checklist.length; ciIdx++) {
      const item = pt.checklist[ciIdx];
      const dbId = ciIds[ciIdx]?.id;
      if (!dbId || !item.completionType || item.completionType === "Activity") continue;
      const ct = item.completionType;
      await prisma.$executeRaw`
        UPDATE "ChecklistItem"
        SET "completionType" = ${ct}::"ChecklistCompletionType"
        WHERE id = ${dbId}
      `;
    }
  }

  // Auto-follow: goal owner always follows; creator also follows if creating on behalf of someone else
  await prisma.goalFollow.upsert({
    where: { userId_goalId: { userId: goalOwnerId, goalId: goal.id } },
    create: { userId: goalOwnerId, goalId: goal.id },
    update: {},
  });
  if (goalOwnerId !== session.user.id) {
    await prisma.goalFollow.upsert({
      where: { userId_goalId: { userId: session.user.id, goalId: goal.id } },
      create: { userId: session.user.id, goalId: goal.id },
      update: {},
    });
  }

  // Auto-schedule activities for checklist items that have an activityTitle
  const appSettings = await prisma.$queryRaw<{ key: string; value: string }[]>`
    SELECT key, value FROM "AppSetting"
  `;
  const schedConfig = buildScheduleConfig(appSettings);
  const cityName = await resolveCityName(needsCityId, needsZoneId, needsClusterId, needsSettlementId);

  for (let piIdx = 0; piIdx < pitstopTemplates.length; piIdx++) {
    const pitstop = pitstopsOrdered[piIdx];
    const pt = pitstopTemplates[piIdx];
    if (!pitstop || !pt) continue;

    const itemsWithActivity = pt.checklist
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !!item.activityTitle);

    if (itemsWithActivity.length === 0) continue;

    const rawStartSla = Number(pt.startSlaDays ?? 0);
    const rawSla = Number(pt.slaDays ?? 0);
    // Guard: if window is zero-width or inverted, derive from recurrence
    const effectiveSla = rawSla > rawStartSla ? rawSla : rawStartSla + (
      pt.recurrence === "Quarterly" ? 90 : pt.recurrence === "Weekly" ? 7 : 30
    );

    const pitstopWindowStart = new Date(goalStart);
    pitstopWindowStart.setDate(pitstopWindowStart.getDate() + rawStartSla);
    const pitstopWindowEnd = new Date(goalStart);
    pitstopWindowEnd.setDate(pitstopWindowEnd.getDate() + effectiveSla);

    const workingDays = getWorkingDays(pitstopWindowStart, pitstopWindowEnd, cityName, schedConfig);
    const effectiveDays = workingDays.length > 0
      ? workingDays
      : [nearestWorkingDay(pitstopWindowEnd, cityName, schedConfig)];

    const scheduledDates = distributeAcrossDays(itemsWithActivity.length, effectiveDays);
    const eventType = pitstopTypeToEventType(pt.type);

    const ciIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ChecklistItem" WHERE "pitstopId" = ${pitstop.id} ORDER BY "order" ASC
    `;

    for (let i = 0; i < itemsWithActivity.length; i++) {
      const { item, idx: ciIdx } = itemsWithActivity[i];
      const scheduledAt = scheduledDates[i];
      const dbId = ciIds[ciIdx]?.id;
      if (!dbId || !scheduledAt) continue;

      const event = await prisma.pitstopEvent.create({
        data: {
          title: item.activityTitle!,
          type: eventType as any,
          scheduledAt,
          createdById: session.user.id,
          pitstops: { create: [{ pitstopId: pitstop.id }] },
          attendees: { create: [{ userId: goalOwnerId }] },
        },
        select: { id: true },
      });

      await prisma.$executeRaw`
        UPDATE "PitstopEvent" SET "checklistItemId" = ${dbId}
        WHERE id = ${event.id} AND "checklistItemId" IS NULL
      `;
      await prisma.$executeRaw`
        UPDATE "ChecklistItem"
        SET status = 'Scheduled'::"ChecklistItemStatus", "updatedAt" = NOW()
        WHERE id = ${dbId} AND status = 'NotStarted'::"ChecklistItemStatus"
      `;
    }
  }

  return Response.json(goal, { status: 201 });
}
