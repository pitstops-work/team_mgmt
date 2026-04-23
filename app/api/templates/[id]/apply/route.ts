import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DbPitstop, interpolatePitstops } from "@/lib/templateDb";

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
    activitySchedules, // Record<number, string> — pitstop index → ISO date string
    ownerId,           // Override goal/pitstop owner (ZL creating on behalf of RP)
  } = body;

  if (!title) return Response.json({ error: "Title required" }, { status: 400 });
  if (!targetDate) return Response.json({ error: "Target date required" }, { status: 400 });
  if (!startDate) return Response.json({ error: "Start date required" }, { status: 400 });

  const rawPitstops = rows[0].pitstops as DbPitstop[];
  const pitstopTemplates = interpolatePitstops(rawPitstops, templateParams ?? {});
  const goalStart = new Date(startDate);
  const goalOwnerId = ownerId ?? session.user.id;

  const goal = await prisma.goal.create({
    data: {
      title,
      description: description ?? null,
      status: "Active",
      ownerId: goalOwnerId,
      targetDate: new Date(targetDate),
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

  // Set progressTag on pitstops via raw SQL (new column, Prisma cache bypass)
  for (let idx = 0; idx < pitstopTemplates.length; idx++) {
    const tag = pitstopTemplates[idx]?.progressTag ?? null;
    const pitstop = goal.pitstops[idx];
    if (!pitstop) continue;
    await prisma.$executeRaw`
      UPDATE "Pitstop" SET "progressTag" = ${tag} WHERE id = ${pitstop.id}
    `;
  }

  // Goal owner auto-follows; if ZL created on behalf of RP, both follow
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

  // Create one PitstopEvent per scheduled checklist-item activity
  // Key format: "${pitstopIdx}_${checklistIdx}" → ISO date string
  if (activitySchedules && typeof activitySchedules === "object") {
    const entries = Object.entries(activitySchedules) as [string, string][];
    for (const [key, dateStr] of entries) {
      if (!dateStr) continue;
      const [piIdxStr, ciIdxStr] = key.split("_");
      const piIdx = Number(piIdxStr);
      const ciIdx = Number(ciIdxStr);
      const pitstop = goal.pitstops[piIdx];
      if (!pitstop) continue;
      const pt = pitstopTemplates[piIdx];
      const checklistItem = pt?.checklist?.[ciIdx];
      if (!checklistItem?.activityTitle) continue;

      const validTypes = ["Meeting", "Visit", "Event"];
      const eventType = validTypes.includes(pt?.type ?? "") ? pt.type : "Meeting";

      const event = await prisma.pitstopEvent.create({
        data: {
          title: checklistItem.activityTitle,
          type: eventType as any,
          scheduledAt: new Date(dateStr),
          createdById: session.user.id,
          pitstops: { create: [{ pitstopId: pitstop.id }] },
          attendees: { create: [{ userId: session.user.id }] },
        },
        select: { id: true },
      });

      // Link event to the specific checklist item and mark it Scheduled
      const dbItem = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "ChecklistItem"
        WHERE "pitstopId" = ${pitstop.id}
        ORDER BY "order" ASC
        OFFSET ${ciIdx} LIMIT 1
      `;
      if (dbItem[0]) {
        await prisma.$executeRaw`
          UPDATE "PitstopEvent" SET "checklistItemId" = ${dbItem[0].id}
          WHERE id = ${event.id} AND "checklistItemId" IS NULL
        `;
        await prisma.$executeRaw`
          UPDATE "ChecklistItem"
          SET status = 'Scheduled'::"ChecklistItemStatus", "updatedAt" = NOW()
          WHERE id = ${dbItem[0].id} AND status = 'NotStarted'::"ChecklistItemStatus"
        `;
      }
    }
  }

  return Response.json(goal, { status: 201 });
}
