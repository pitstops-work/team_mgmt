import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiCurator } from "@/lib/wiki/auth";
import type { NextRequest } from "next/server";

// Soft-delete (archive) a field observation. Observer (always) OR curator.
// Observations are append-only by default — only typo-grade retractions and
// curator clean-up should ever come through here.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const obs = await prisma.wikiPracticeObservation.findUnique({
    where: { id },
    select: { id: true, observerId: true, archivedAt: true },
  });
  if (!obs) return Response.json({ error: "Not found" }, { status: 404 });
  if (obs.archivedAt) return Response.json({ error: "Already archived" }, { status: 409 });

  const isObserver = obs.observerId === userId;
  const curator = isObserver ? false : await isWikiCurator(userId);
  if (!isObserver && !curator) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.wikiPracticeObservation.update({
    where: { id: obs.id },
    data: { archivedAt: new Date(), archivedById: userId },
  });
  return Response.json({ ok: true });
}
