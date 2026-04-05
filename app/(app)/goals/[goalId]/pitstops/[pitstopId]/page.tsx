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

  const [pitstop, users, subscriptions] = await Promise.all([
    prisma.pitstop.findUnique({
      where: { id: pitstopId, deletedAt: null },
      include: {
        goal: { select: { id: true, title: true } },
        attachments: true,
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
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true, image: true } }),
    prisma.threadSubscription.findMany({
      where: { userId },
      select: { threadId: true },
    }),
  ]);

  if (!pitstop || pitstop.goal.id !== goalId) notFound();

  const subscribedThreadIds = new Set(subscriptions.map((s) => s.threadId));

  return (
    <PitstopDetail
      pitstop={JSON.parse(JSON.stringify(pitstop))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={userId}
      currentUserName={session!.user!.name ?? session!.user!.email ?? ""}
      subscribedThreadIds={Array.from(subscribedThreadIds)}
    />
  );
}
