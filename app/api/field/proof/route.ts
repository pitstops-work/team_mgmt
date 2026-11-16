// Record closure proof for a /field step: a voice note or a photo.
//   POST multipart { kind: "setup" | "visit", stepId, file }
//
// Records the proof only — it does NOT mark the step done. The RP still closes
// the step through the usual route (/api/field/step for setup, the visit
// route's "tick" for a visit step), which refuses a Voice / Upload step that
// has no proof. Keeping the two apart means a step with a form still has its
// form gate checked at the moment it is closed.
//
// Setup proof attaches to the FieldStep. Visit proof attaches to this visit's
// FieldVisitStep (one occurrence), created here as Todo if it doesn't exist yet.
import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { assertFieldGoalAccess } from "@/lib/field/access";
import { normalizeClosureType } from "@/lib/field/closure";
import { transcribeAudio, translateToAll } from "@/lib/voice";

export const maxDuration = 60;

// Vercel refuses request bodies over 4.5 MB before the route runs. The client
// downsizes photos; this is the backstop with a readable error.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Could not read the upload" }, { status: 400 });
  }
  const kind = form.get("kind") === "visit" ? "visit" : "setup";
  const stepId = String(form.get("stepId") ?? "");
  const file = form.get("file");
  if (!stepId || !(file instanceof File) || file.size === 0) return Response.json({ error: "Nothing to upload" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "File too large (4 MB max)" }, { status: 413 });

  const step = await prisma.fieldStep.findFirst({
    where: { id: stepId, kind: kind === "visit" ? "Visit" : "Setup", deletedAt: null },
    select: { id: true, goalId: true, closureType: true },
  });
  if (!step) return Response.json({ error: "Not found" }, { status: 404 });
  if (!(await assertFieldGoalAccess(userId, step.goalId))) return Response.json({ error: "Forbidden" }, { status: 403 });

  // The proof must be the kind the step asks for — a photo doesn't close a
  // voice-note step, and a plain mark-done step takes no proof at all.
  const closure = normalizeClosureType(step.closureType);
  const mimeType = file.type || "application/octet-stream";
  const isAudio = mimeType.startsWith("audio/");
  if (closure === "Activity") return Response.json({ error: "This step closes with a plain mark-done" }, { status: 400 });
  if (closure === "Voice" && !isAudio) return Response.json({ error: "This step needs a voice note" }, { status: 400 });
  if (closure === "Upload" && isAudio) return Response.json({ error: "This step needs a photo or file" }, { status: 400 });

  // Visit proof belongs to the open visit's occurrence of this step.
  let visitStepId: string | null = null;
  if (kind === "visit") {
    const visit = await prisma.fieldVisit.findFirst({ where: { goalId: step.goalId, closedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (!visit) return Response.json({ error: "No open visit" }, { status: 400 });
    const vs = await prisma.fieldVisitStep.upsert({
      where: { visitId_stepId: { visitId: visit.id, stepId } },
      create: { visitId: visit.id, stepId, status: "Todo", lastUpdatedById: userId },
      update: { lastUpdatedById: userId },
      select: { id: true },
    });
    visitStepId = vs.id;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? (isAudio ? (mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm") : "jpg")).toLowerCase();
  let url: string;
  try {
    const blob = await put(`field-proof/${stepId}/${Date.now()}.${ext}`, buffer, { access: "private", contentType: mimeType });
    url = blob.url;
  } catch (e) {
    console.error("field proof upload failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }

  const attachment = await prisma.attachment.create({
    data: {
      name: isAudio ? `voice-note.${ext}` : file.name || `photo.${ext}`,
      type: "File",
      url,
      size: buffer.byteLength,
      mimeType,
      fieldStepId: kind === "setup" ? step.id : null,
      fieldVisitStepId: visitStepId,
    },
    select: { id: true },
  });

  // Transcribe a voice note. Fail-soft: the recording IS the proof, so a
  // transcription outage must not stop an RP closing a step in the field.
  let transcript: string | null = null;
  if (isAudio) {
    try {
      const { text, detectedLang } = await transcribeAudio(buffer, mimeType);
      transcript = detectedLang === "en" ? text : (await translateToAll(text, detectedLang))["en"] ?? text;
    } catch (e) {
      console.error("field proof transcription failed:", e instanceof Error ? e.message : e);
    }
    if (transcript) {
      if (visitStepId) await prisma.fieldVisitStep.update({ where: { id: visitStepId }, data: { note: transcript } });
      else await prisma.fieldStep.update({ where: { id: step.id }, data: { note: transcript, lastUpdatedById: userId } });
    }
  } else if (!visitStepId) {
    await prisma.fieldStep.update({ where: { id: step.id }, data: { lastUpdatedById: userId } });
  }

  return Response.json({ ok: true, attachmentId: attachment.id, transcript });
}
