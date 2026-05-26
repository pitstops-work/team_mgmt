import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { buildRbacContext, can } from "@/lib/rbac";
import PitstopDetail from "./PitstopDetail";

export default async function PitstopPage({
  params,
}: {
  params: Promise<{ goalId: string; pitstopId: string }>;
}) {
  const session = await auth();
  const { goalId, pitstopId } = await params;
  const userId = session!.user!.id!;

  const [pitstop, users, subscriptions, siblingPitstops] = await Promise.all([
    prisma.pitstop.findUnique({
      where: { id: pitstopId, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        goal: { select: { id: true, title: true, targetDate: true } },
        attachments: true,
        checklistItems: { orderBy: { order: "asc" } },
        blockedBy: {
          include: { blockedBy: { select: { id: true, title: true, status: true } } },
        },
        blocking: {
          include: { blocked: { select: { id: true, title: true, status: true } } },
        },
        threads: {
          where: { deletedAt: null },
          include: {
            messages: {
              where: { deletedAt: null },
              include: {
                author: { select: { id: true, name: true, image: true } },
                attachments: true,
                mentions: { include: { user: { select: { id: true, name: true } } } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        verifiedBy: { select: { id: true, name: true, image: true } },
        dateChanges: {
          orderBy: { createdAt: "asc" },
          include: { changedBy: { select: { id: true, name: true, image: true } } },
        },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true, image: true } }),
    prisma.threadSubscription.findMany({
      where: { userId },
      select: { threadId: true },
    }),
    prisma.pitstop.findMany({
      where: { goalId, deletedAt: null },
      select: { id: true, title: true, status: true },
      orderBy: { order: "asc" },
    }),
  ]);

  if (!pitstop || pitstop.goal.id !== goalId) notFound();

  // Raw SQL for new fields — Prisma include silently drops columns added after
  // Lambda warm-up; raw SQL always reads the live schema.
  const langRows = await prisma.$queryRaw<{ preferredLang: string }[]>`
    SELECT "preferredLang" FROM "User" WHERE id = ${userId} LIMIT 1
  `;
  const preferredLang = langRows[0]?.preferredLang ?? "en";

  // Collect all message IDs across threads and patch in voice fields via raw SQL
  const allMessageIds = pitstop?.threads.flatMap(t => t.messages.map(m => m.id)) ?? [];
  if (allMessageIds.length > 0) {
    const voiceRows = await prisma.$queryRaw<{
      id: string;
      msgType: string;
      audioUrl: string | null;
      originalLang: string;
      translations: Record<string, string> | null;
    }[]>`
      SELECT id, "msgType", "audioUrl", "originalLang", translations
      FROM "Message"
      WHERE id = ANY(${allMessageIds})
    `;
    const voiceMap = new Map(voiceRows.map(r => [r.id, r]));
    for (const thread of pitstop!.threads) {
      for (const msg of thread.messages) {
        const v = voiceMap.get(msg.id);
        if (v) Object.assign(msg, v);
      }
    }
  }

  // Patch progressTag on the pitstop itself (new field, Prisma cache may not include it)
  const [ptTagRow] = await prisma.$queryRaw<{ progressTag: string | null }[]>`
    SELECT "progressTag" FROM "Pitstop" WHERE id = ${pitstopId} LIMIT 1
  `;
  if (ptTagRow) (pitstop as Record<string, unknown>).progressTag = ptTagRow.progressTag ?? null;

  // Patch checklist items with new fields (status, assigneeId, notes) via raw SQL
  // (Prisma Lambda cache may not know about columns added after warm-up)
  const checklistIds = pitstop.checklistItems.map((ci) => ci.id);
  if (checklistIds.length > 0) {
    const ciRows = await prisma.$queryRaw<{
      id: string; status: string; assigneeId: string | null; notes: string | null; completionType: string;
    }[]>`
      SELECT id, status::text, "assigneeId", notes, "completionType"::text
      FROM "ChecklistItem" WHERE id = ANY(${checklistIds})
    `;
    const ciMap = new Map(ciRows.map((r) => [r.id, r]));

    const activityRows = await prisma.$queryRaw<{
      checklistItemId: string; id: string; title: string; scheduledAt: string; status: string;
    }[]>`
      SELECT "checklistItemId", id, title, "scheduledAt"::text, status::text
      FROM "PitstopEvent"
      WHERE "checklistItemId" = ANY(${checklistIds}) AND "deletedAt" IS NULL
      ORDER BY "scheduledAt" ASC
    `;
    const activityMap = new Map<string, { id: string; title: string; scheduledAt: string; status: string }[]>();
    for (const r of activityRows) {
      const arr = activityMap.get(r.checklistItemId) ?? [];
      arr.push({ id: r.id, title: r.title, scheduledAt: r.scheduledAt, status: r.status });
      activityMap.set(r.checklistItemId, arr);
    }

    const attachmentRows = await prisma.$queryRaw<{
      checklistItemId: string; id: string; name: string; url: string; type: string; mimeType: string | null;
    }[]>`
      SELECT "checklistItemId", id, name, url, type::text, "mimeType"
      FROM "Attachment"
      WHERE "checklistItemId" = ANY(${checklistIds})
      ORDER BY "createdAt" ASC
    `;
    const attachmentMap = new Map<string, { id: string; name: string; url: string; type: string; mimeType: string | null }[]>();
    for (const r of attachmentRows) {
      const arr = attachmentMap.get(r.checklistItemId) ?? [];
      arr.push({ id: r.id, name: r.name, url: r.url, type: r.type, mimeType: r.mimeType });
      attachmentMap.set(r.checklistItemId, arr);
    }

    for (const ci of pitstop.checklistItems) {
      const row = ciMap.get(ci.id);
      if (row) Object.assign(ci, row);
      (ci as Record<string, unknown>).activities = activityMap.get(ci.id) ?? [];
      (ci as Record<string, unknown>).attachments = attachmentMap.get(ci.id) ?? [];
    }
  }

  const subscribedThreadIds = new Set(subscriptions.map((s) => s.threadId));

  const currentUserRole = (session as { user?: { role?: string } } | null)?.user?.role ?? "member";

  const ctx = await buildRbacContext(session);
  // Direct manual checklist edits (tick box, status dropdown) require this.
  const canUpdateChecklist = ctx ? await can(ctx, "checklist_item", "update") : false;
  // Completing the linked activity (mark done / voice log / upload proof) is
  // governed by the activity permission, which members keep.
  const canCompleteActivity = ctx ? await can(ctx, "pitstop_event", "update") : false;

  return (
    <PitstopDetail
      pitstop={JSON.parse(JSON.stringify(pitstop))}
      users={JSON.parse(JSON.stringify(users))}
      siblingPitstops={JSON.parse(JSON.stringify(siblingPitstops))}
      currentUserId={userId}
      currentUserName={session!.user!.name ?? session!.user!.email ?? ""}
      currentUserRole={currentUserRole}
      canUpdateChecklist={canUpdateChecklist}
      canCompleteActivity={canCompleteActivity}
      subscribedThreadIds={Array.from(subscribedThreadIds)}
      preferredLang={preferredLang}
    />
  );
}
