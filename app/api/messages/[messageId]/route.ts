import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = await params;

  const message = await prisma.message.findUnique({
    where: { id: messageId, deletedAt: null },
    include: {
      author: { select: { id: true, name: true, image: true } },
      attachments: true,
      mentions: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  if (!message) return Response.json({ error: "Not found" }, { status: 404 });

  // Patch voice fields via raw SQL
  const rows = await prisma.$queryRaw<{
    msgType: string; audioUrl: string | null;
    originalLang: string; translations: Record<string, string> | null;
  }[]>`
    SELECT "msgType", "audioUrl", "originalLang", translations
    FROM "Message" WHERE id = ${messageId} LIMIT 1
  `;
  if (rows[0]) Object.assign(message, rows[0]);

  return Response.json(message);
}
