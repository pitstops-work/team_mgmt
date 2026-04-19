import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { uploadAudio, transcribeAudio, translateToAll } from "@/lib/voice";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;

  // Parse multipart form — expects a single "audio" field
  const formData = await req.formData();
  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) return Response.json({ error: "No audio file" }, { status: 400 });

  const mimeType = audioFile.type || "audio/webm";
  const buffer = Buffer.from(await audioFile.arrayBuffer());

  // 1. Upload raw audio to Vercel Blob
  const audioUrl = await uploadAudio(buffer, mimeType, threadId);

  // 2. Transcribe with Groq Whisper (auto-detects language)
  const { text, detectedLang } = await transcribeAudio(buffer, mimeType);
  if (!text) return Response.json({ error: "Transcription empty" }, { status: 422 });

  // 3. Translate to all other languages in parallel
  const translations = await translateToAll(text, detectedLang);

  // 4. Save message
  const message = await prisma.message.create({
    data: {
      body: text,
      authorId: session.user.id,
      threadId,
      msgType: "voice",
      audioUrl,
      originalLang: detectedLang,
      translations,
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

  // 5. Notifications (mirrors text message logic)
  const authorName = message.author.name ?? "Someone";
  const threadName = message.thread.name;

  let link = "/threads";
  let contextLabel = threadName;
  const pitstop = message.thread.pitstop;
  if (pitstop) {
    link = `/goals/${pitstop.goal.id}/pitstops/${pitstop.id}`;
    contextLabel = pitstop.title;
  } else if (message.thread.goal) {
    link = `/goals/${message.thread.goal.id}`;
    contextLabel = message.thread.goal.title;
  } else if (message.thread.event) {
    link = `/activities`;
    contextLabel = message.thread.event.title;
  }

  const subscribers = await prisma.threadSubscription.findMany({
    where: { threadId },
    select: { userId: true },
  });

  const notifications = subscribers
    .filter((s) => s.userId !== session.user.id)
    .map((s) => ({
      userId: s.userId,
      type: "NewMessage" as const,
      title: `New voice message in #${threadName}`,
      body: `${authorName} posted in ${contextLabel}`,
      link,
    }));

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
    sendPushToUsers(
      notifications.map((n) => n.userId),
      { title: `New voice message in #${threadName}`, body: `${authorName} posted in ${contextLabel}`, link }
    );
  }

  const { thread: _thread, ...messageOut } = message;
  return Response.json(messageOut, { status: 201 });
}
