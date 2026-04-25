import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDownloadUrl } from "@vercel/blob";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id }, select: { url: true, name: true } });
  if (!attachment) return Response.json({ error: "Not found" }, { status: 404 });

  const downloadUrl = getDownloadUrl(attachment.url);
  return Response.redirect(downloadUrl);
}
