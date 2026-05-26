import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { uploadAudio, transcribeAudio, translateToAll } from "@/lib/voice";
import { autoAdvancePitstopFromItem } from "@/lib/autoAdvancePitstop";
import { buildRbacContext, can } from "@/lib/rbac";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // A voice log completes the linked activity (its proof). Governed by
  // pitstop_event.update — the permission to complete activities — NOT
  // checklist_item.update, which only gates direct manual edits to the list.
  const ctx = await buildRbacContext(session);
  if (!ctx || !(await can(ctx, "pitstop_event", "update"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const [ci] = await prisma.$queryRaw<{ completionType: string }[]>`
    SELECT "completionType"::text FROM "ChecklistItem" WHERE id = ${itemId}
  `;
  if (ci?.completionType !== 'Voice') {
    return Response.json({ error: "This item must be completed via its scheduled activity" }, { status: 400 });
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
