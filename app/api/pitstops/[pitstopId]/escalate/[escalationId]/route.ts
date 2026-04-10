import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pitstopId: string; escalationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { escalationId } = await params;
  const { resolved } = await req.json();

  const escalation = await prisma.pitstopEscalation.update({
    where: { id: escalationId },
    data: { resolvedAt: resolved ? new Date() : null },
    include: {
      escalatedBy: { select: { id: true, name: true, image: true } },
      escalatedTo: { select: { id: true, name: true, image: true } },
    },
  });

  return Response.json(escalation);
}
