import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { uploadAudio, transcribeAudio, translateToAll } from "@/lib/voice";
import { autoAdvancePitstopFromItem } from "@/lib/autoAdvancePitstop";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;

  let audioFile: File | null = null;
  try {
    const formData = await req.formData();
    audioFile = formData.get("audio") as File | null;
  } catch {
    return Response.json({ error: "Could not parse audio upload" }, { status: 400 });
  }

  if (!audioFile) return Response.json({ error: "No audio file" }, { status: 400 });

  const mimeType = audioFile.type || "audio/webm";
  const buffer = Buffer.from(await audioFile.arrayBuffer());

  try {
    await uploadAudio(buffer, mimeType, itemId);
  } catch {
    return Response.json({ error: "Audio upload failed" }, { status: 500 });
  }

  let notes = "";
  try {
    const { text, detectedLang } = await transcribeAudio(buffer, mimeType);
    if (detectedLang === "en") {
      notes = text;
    } else {
      const translations = await translateToAll(text, detectedLang);
      notes = translations["en"] ?? text;
    }
  } catch {
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }

  await prisma.$executeRaw`
    UPDATE "ChecklistItem"
    SET
      status        = 'Done'::"ChecklistItemStatus",
      checked       = TRUE,
      notes         = ${notes},
      "completedAt" = NOW(),
      "updatedAt"   = NOW()
    WHERE id = ${itemId}
  `;

  await autoAdvancePitstopFromItem(itemId);

  const updated = await prisma.$queryRaw<{
    id: string; text: string; checked: boolean; status: string; notes: string | null;
  }[]>`
    SELECT id, text, checked, status::text, notes
    FROM "ChecklistItem" WHERE id = ${itemId} LIMIT 1
  `;

  return Response.json(updated[0] ?? { ok: true });
}
