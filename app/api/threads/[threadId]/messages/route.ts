import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const { body, attachmentIds } = await req.json();
  if (!body?.trim()) return Response.json({ error: "Body required" }, { status: 400 });

  // Parse @mentions from body
  const mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentionedUserIds: string[] = [];
  let match;
  while ((match = mentionPattern.exec(body)) !== null) {
    mentionedUserIds.push(match[2]);
  }

  const message = await prisma.message.create({
    data: {
      body,
      authorId: session.user.id,
      threadId,
      attachments: attachmentIds?.length
        ? { connect: attachmentIds.map((id: string) => ({ id })) }
        : undefined,
      mentions: mentionedUserIds.length
        ? { create: mentionedUserIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      attachments: true,
      mentions: { include: { user: { select: { id: true, name: true } } } },
      thread: { include: { pitstop: { include: { goal: true } } } },
    },
  });

  const authorName = message.author.name ?? "Someone";
  const pitstop = message.thread.pitstop;
  const goal = pitstop.goal;
  const link = `/goals/${goal.id}/pitstops/${pitstop.id}`;
  const threadName = message.thread.name;

  // Notify mentioned users (excluding the author)
  const mentionNotifications = mentionedUserIds
    .filter((id) => id !== session.user.id)
    .map((userId) => ({
      userId,
      type: "Mention" as const,
      title: `${authorName} mentioned you`,
      body: `In #${threadName} · ${pitstop.title}`,
      link,
    }));

  // Notify thread subscribers (excluding author and already-mentioned users)
  const subscribers = await prisma.threadSubscription.findMany({
    where: { threadId },
    select: { userId: true },
  });
  const mentionedSet = new Set(mentionedUserIds);
  const subscriberNotifications = subscribers
    .filter((s) => s.userId !== session.user.id && !mentionedSet.has(s.userId))
    .map((s) => ({
      userId: s.userId,
      type: "NewMessage" as const,
      title: `New message in #${threadName}`,
      body: `${authorName} posted in ${pitstop.title}`,
      link,
    }));

  const allNotifications = [...mentionNotifications, ...subscriberNotifications];
  if (allNotifications.length > 0) {
    await prisma.notification.createMany({ data: allNotifications });
  }

  // Strip the thread relation before returning to keep response shape stable
  const { thread: _thread, ...messageOut } = message;
  return Response.json(messageOut, { status: 201 });
}
