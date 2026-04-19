import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
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

  // Raw SQL for preferredLang — new field, Prisma select silently returns
  // undefined on stale Lambda cache; raw bypasses it.
  const langRows = await prisma.$queryRaw<{ preferredLang: string }[]>`
    SELECT "preferredLang" FROM "User" WHERE id = ${userId} LIMIT 1
  `;
  const preferredLang = langRows[0]?.preferredLang ?? "en";

  const subscribedThreadIds = new Set(subscriptions.map((s) => s.threadId));

  return (
    <PitstopDetail
      pitstop={JSON.parse(JSON.stringify(pitstop))}
      users={JSON.parse(JSON.stringify(users))}
      siblingPitstops={JSON.parse(JSON.stringify(siblingPitstops))}
      currentUserId={userId}
      currentUserName={session!.user!.name ?? session!.user!.email ?? ""}
      subscribedThreadIds={Array.from(subscribedThreadIds)}
      preferredLang={preferredLang}
    />
  );
}
