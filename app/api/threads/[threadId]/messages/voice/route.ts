import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { uploadAudio, transcribeAudio, translateToAll } from "@/lib/voice";

export const maxDuration = 60; // allow up to 60s — transcription + 5 parallel translations

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
    console.error("[voice] blob upload failed:", e);
    return Response.json({ error: "Audio upload failed" }, { status: 500 });
  }

  // 2. Transcribe with Groq Whisper
  let text: string;
  let detectedLang: string;
  try {
    const result = await transcribeAudio(buffer, mimeType);
    text = result.text;
    detectedLang = result.detectedLang;
    console.log(`[voice] transcribed lang=${detectedLang} text="${text.slice(0, 80)}"`);
  } catch (e) {
    console.error("[voice] transcription failed:", e);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }

  if (!text) return Response.json({ error: "Transcription empty" }, { status: 422 });

  // 3. Translate to all other languages in parallel
  let translations: Record<string, string>;
  try {
    translations = await translateToAll(text, detectedLang as "en" | "ta" | "kn" | "ml" | "hi" | "bn");
    console.log("[voice] translations done:", Object.keys(translations));
  } catch (e) {
    console.error("[voice] translation failed:", e);
    // Non-fatal: store message without translations
    translations = { [detectedLang]: text };
  }

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

  // 5. Notifications
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
