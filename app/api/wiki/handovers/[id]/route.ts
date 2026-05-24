import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { nextOwnerTermEnd } from "@/lib/wiki/review";
import type { NextRequest } from "next/server";

// PATCH body: { action: "accept" | "decline" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const handover = await prisma.wikiOwnerHandover.findUnique({
    where: { id },
    select: {
      id: true,
      pageId: true,
      fromUserId: true,
      toUserId: true,
      status: true,
    },
  });
  if (!handover) return Response.json({ error: "Not found" }, { status: 404 });
  if (handover.status !== "pending") {
    return Response.json({ error: "Already resolved" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const action = body && typeof body.action === "string" ? body.action : "";
  if (action !== "accept" && action !== "decline") {
    return Response.json({ error: "action must be accept | decline" }, { status: 400 });
  }

  // Recipient or steward can decide. Sender can also withdraw (treated as decline).
  const steward = await isWikiSteward(userId);
  const isRecipient = handover.toUserId === userId;
  const isSender = handover.fromUserId === userId;
  if (!isRecipient && !isSender && !steward) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Senders can only decline (withdraw); they shouldn't be able to accept on
  // behalf of the recipient.
  if (action === "accept" && !isRecipient && !steward) {
    return Response.json({ error: "Only the recipient can accept" }, { status: 403 });
  }

  const now = new Date();

  if (action === "decline") {
    const updated = await prisma.wikiOwnerHandover.update({
      where: { id: handover.id },
      data: { status: "declined", completedAt: now },
      select: { id: true, status: true },
    });
    return Response.json({ handover: updated });
  }

  // Accept: transactionally update both the handover row and the page owner.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.wikiOwnerHandover.update({
      where: { id: handover.id },
      data: { status: "accepted", completedAt: now },
    });
    await tx.wikiPage.update({
      where: { id: handover.pageId },
      data: {
        ownerId: handover.toUserId,
        ownerTermStart: now,
        ownerTermEnd: nextOwnerTermEnd(now),
        // Coming back from orphaned status is the whole point of accepting.
        status: "published",
      },
    });
    return tx.wikiOwnerHandover.findUnique({
      where: { id: handover.id },
      select: { id: true, status: true, completedAt: true },
    });
  });

  return Response.json({ handover: updated });
}
