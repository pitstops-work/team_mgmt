// Serve one evidence file, only to someone who may see its effort.
import prisma from "@/lib/prisma";
import { requireActorForView, can, UrbanAccessError } from "@/lib/urban/access";
import { readEvidence } from "@/lib/urban/evidence";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActorForView();
    const { id } = await params;
    const ev = await prisma.uoEvidence.findUnique({ where: { id }, select: { url: true, name: true, mimeType: true, task: { select: { effortId: true } } } });
    if (!ev || !(await can(actor, "effort.view", ev.task.effortId))) return new Response("Not found", { status: 404 });
    const file = await readEvidence(ev.url);
    if (!file) return new Response("File not available", { status: 404 });
    return new Response(file.body as BodyInit, {
      headers: {
        "Content-Type": ev.mimeType ?? file.contentType ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(ev.name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof UrbanAccessError) return new Response("Not allowed", { status: 403 });
    throw e;
  }
}
