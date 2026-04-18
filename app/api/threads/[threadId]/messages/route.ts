import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

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
      thread: {
        include: {
          pitstop: { include: { goal: true } },
          goal: { select: { id: true, title: true } },
          event: { select: { id: true, title: true } },
        },
      },
    },
  });

  const authorName = message.author.name ?? "Someone";
  const threadName = message.thread.name;

  // Build link and context label depending on thread parent type
  let link = "/threads";
  let contextLabel = threadName;
  const pitstop = message.thread.pitstop;
  if (pitstop) {
    const goal = pitstop.goal;
    link = `/goals/${goal.id}/pitstops/${pitstop.id}`;
    contextLabel = pitstop.title;
  } else if (message.thread.goal) {
    link = `/goals/${message.thread.goal.id}`;
    contextLabel = message.thread.goal.title;
  } else if (message.thread.event) {
    link = `/activities`;
    contextLabel = message.thread.event.title;
  }

  // Notify mentioned users (excluding the author)
  const mentionNotifications = mentionedUserIds
    .filter((id) => id !== session.user.id)
    .map((userId) => ({
      userId,
      type: "Mention" as const,
      title: `${authorName} mentioned you`,
      body: `In #${threadName} · ${contextLabel}`,
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
      body: `${authorName} posted in ${contextLabel}`,
      link,
    }));

  // Mentioned users auto-subscribe to the thread
  if (mentionedUserIds.length > 0) {
    await Promise.allSettled(
      mentionedUserIds
        .filter((id) => id !== session.user.id)
        .map((userId) =>
          prisma.threadSubscription.upsert({
            where: { userId_threadId: { userId, threadId } },
            create: { userId, threadId },
            update: {},
          })
        )
    );
  }

  const allNotifications = [...mentionNotifications, ...subscriberNotifications];
  if (allNotifications.length > 0) {
    await prisma.notification.createMany({ data: allNotifications });
    const mentionIds = mentionNotifications.map((n) => n.userId);
    const subIds = subscriberNotifications.map((n) => n.userId);
    if (mentionIds.length > 0) {
      sendPushToUsers(mentionIds, { title: `${authorName} mentioned you`, body: `In #${threadName} · ${contextLabel}`, link });
    }
    if (subIds.length > 0) {
      sendPushToUsers(subIds, { title: `New message in #${threadName}`, body: `${authorName} posted in ${contextLabel}`, link });
    }
  }

  // Strip the thread relation before returning to keep response shape stable
  const { thread: _thread, ...messageOut } = message;
  return Response.json(messageOut, { status: 201 });
}
