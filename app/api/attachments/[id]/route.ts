import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { del } from "@vercel/blob";
import { viewerForbidden } from "@/lib/roleGuard";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session);
  if (veto) return veto;

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id }, select: { url: true } });
  if (!attachment) return Response.json({ error: "Not found" }, { status: 404 });

  // Delete from Blob storage, then from DB
  try { await del(attachment.url); } catch { /* blob may already be gone */ }
  await prisma.attachment.delete({ where: { id } });

  return Response.json({ ok: true });
}
