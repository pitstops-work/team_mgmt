import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { viewerForbidden } from "@/lib/roleGuard";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;

  const messages = await prisma.message.findMany({
    where: { threadId, deletedAt: null },
    include: {
      author: { select: { id: true, name: true, image: true } },
      attachments: true,
      mentions: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Patch voice fields via raw SQL (bypasses stale Lambda cache)
  const ids = messages.map(m => m.id);
  if (ids.length > 0) {
    const voiceRows = await prisma.$queryRaw<{
      id: string; msgType: string; audioUrl: string | null;
      originalLang: string; translations: Record<string, string> | null;
    }[]>`
      SELECT id, "msgType", "audioUrl", "originalLang", translations
      FROM "Message" WHERE id = ANY(${ids})
    `;
    const vm = new Map(voiceRows.map(r => [r.id, r]));
    for (const m of messages) {
      const v = vm.get(m.id);
      if (v) Object.assign(m, v);
    }
  }

  return Response.json(messages);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { threadId } = await params;
  const { body, attachmentIds } = await req.json();
  const trimmedBody = (body ?? "").trim();
  const hasAttachments = Array.isArray(attachmentIds) && attachmentIds.length > 0;
  if (!trimmedBody && !hasAttachments) {
    return Response.json({ error: "Body or attachments required" }, { status: 400 });
  }

  // Parse @mentions from body
  const mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentionedUserIds: string[] = [];
  let match;
  while ((match = mentionPattern.exec(body)) !== null) {
    mentionedUserIds.push(match[2]);
  }

  const message = await prisma.message.create({
    data: {
      body: trimmedBody,
      authorId: session.user.id,
      threadId,
      attachments: hasAttachments
        ? { connect: (attachmentIds as string[]).map((id) => ({ id })) }
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
  const link = `/threads?thread=${threadId}`;
  let contextLabel = threadName;
  const pitstop = message.thread.pitstop;
  if (pitstop) {
    contextLabel = pitstop.title;
  } else if (message.thread.goal) {
    contextLabel = message.thread.goal.title;
  } else if (message.thread.event) {
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
