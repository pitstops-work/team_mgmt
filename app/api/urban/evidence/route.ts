// Attach a voice note or photo to a task.
//   POST multipart { taskId, file }
// Records the evidence only; the task is closed by completing it, which checks
// the evidence is there. Voice notes are transcribed (fail-soft: the recording
// is the proof, so a transcription outage must not block the RP).
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireActorForAction, authorize, UrbanAccessError } from "@/lib/urban/access";
import { logEvent } from "@/lib/urban/events";
import { storeEvidence } from "@/lib/urban/evidence";
import { transcribeAudio, translateToAll } from "@/lib/voice";

export const maxDuration = 60;
// Vercel refuses bodies over 4.5 MB before the route runs; the client downsizes photos.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActorForAction();
    const form = await req.formData();
    const taskId = String(form.get("taskId") ?? "");
    const file = form.get("file");
    if (!taskId || !(file instanceof File) || file.size === 0) return Response.json({ error: "Nothing to upload" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "File too large (4 MB max)" }, { status: 413 });

    const task = await prisma.uoTask.findUnique({ where: { id: taskId }, select: { id: true, effortId: true, status: true, checkType: true, session: { select: { closedAt: true } } } });
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });
    await authorize(actor, "effort.work", task.effortId);
    if (task.status !== "open" || task.session?.closedAt) return Response.json({ error: "This item is closed" }, { status: 400 });

    const mimeType = file.type || "application/octet-stream";
    const isAudio = mimeType.startsWith("audio/");
    if (task.checkType === "voice" && !isAudio) return Response.json({ error: "This item needs a voice note" }, { status: 400 });
    if (task.checkType === "photo" && isAudio) return Response.json({ error: "This item needs a photo or file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? (isAudio ? (mimeType.includes("mp4") ? "mp4" : "webm") : "jpg")).toLowerCase();
    const url = await storeEvidence(`${taskId}.${ext}`, buffer, mimeType);

    let transcript: string | null = null;
    if (isAudio) {
      try {
        const { text, detectedLang } = await transcribeAudio(buffer, mimeType);
        transcript = detectedLang === "en" ? text : (await translateToAll(text, detectedLang))["en"] ?? text;
      } catch (e) {
        console.error("[urban] transcription failed", e instanceof Error ? e.message : e);
      }
    }

    const ev = await prisma.$transaction(async (tx) => {
      const ev = await tx.uoEvidence.create({
        data: { taskId, kind: isAudio ? "voice" : mimeType.startsWith("image/") ? "photo" : "file", url, name: isAudio ? `voice-note.${ext}` : file.name || `photo.${ext}`, mimeType, size: buffer.byteLength, transcript, createdById: actor.id },
        select: { id: true },
      });
      await logEvent(tx, { actorId: actor.id, entity: "evidence", entityId: ev.id, action: "added", after: { taskId, kind: isAudio ? "voice" : "file" } });
      return ev;
    });
    return Response.json({ ok: true, id: ev.id, transcript });
  } catch (e) {
    if (e instanceof UrbanAccessError) return Response.json({ error: "Not allowed" }, { status: 403 });
    console.error("[urban] evidence upload failed", e);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
