import { NextRequest, after } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { sendPushToUsers } from "@/lib/push";
import { uploadAudio, transcribeAudio, translateToAll } from "@/lib/voice";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;

  let audioFile: File | null = null;
  try {
    const formData = await req.formData();
    audioFile = formData.get("audio") as File | null;
  } catch (e) {
    console.error("[voice] formData parse error:", e);
    return Response.json({ error: "Could not parse audio upload" }, { status: 400 });
  }

  if (!audioFile) return Response.json({ error: "No audio file" }, { status: 400 });

  const mimeType = audioFile.type || "audio/webm";
  const buffer = Buffer.from(await audioFile.arrayBuffer());
  console.log(`[voice] received ${buffer.byteLength} bytes, mimeType=${mimeType}`);

  // 1. Upload raw audio to Vercel Blob
  let audioUrl: string;
  try {
    audioUrl = await uploadAudio(buffer, mimeType, threadId);
    console.log("[voice] blob uploaded:", audioUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[voice] blob upload failed:", msg);
    return Response.json({ error: `Audio upload failed: ${msg}` }, { status: 500 });
  }

  // 2. Transcribe
  let text: string;
  let detectedLang: string;
  try {
    const result = await transcribeAudio(buffer, mimeType);
    text = result.text;
    detectedLang = result.detectedLang;
    console.log(`[voice] transcribed lang=${detectedLang} text="${text.slice(0, 80)}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[voice] transcription failed:", msg);
    return Response.json({ error: `Transcription failed: ${msg}` }, { status: 500 });
  }

  if (!text) return Response.json({ error: "Transcription empty" }, { status: 422 });

  // 3. Save message immediately with no translations yet (translating=true)
  const message = await prisma.message.create({
    data: {
      body: text,
      authorId: session.user.id,
      threadId,
      msgType: "voice",
      audioUrl,
      originalLang: detectedLang,
      translations: Prisma.JsonNull,
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

  // 4. Notifications
  const authorName = message.author.name ?? "Someone";
  const threadName = message.thread.name;

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

  // 5. Translate in background after response is sent
  const messageId = message.id;
  const langCode = detectedLang as "en" | "ta" | "kn" | "ml" | "hi" | "bn";
  after(async () => {
    try {
      const translations = await translateToAll(text, langCode);
      await prisma.$executeRaw`
        UPDATE "Message" SET translations = ${JSON.stringify(translations)}::jsonb
        WHERE id = ${messageId}
      `;
      console.log(`[voice] translations patched for message ${messageId}`);
    } catch (e) {
      console.error("[voice] background translation failed:", e);
    }
  });

  const { thread: _thread, ...messageOut } = message;
  // Signal to the client that translations are pending
  return Response.json({ ...messageOut, translating: true }, { status: 201 });
}
