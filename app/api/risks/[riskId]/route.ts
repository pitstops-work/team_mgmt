import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ riskId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { riskId } = await params;
  const { status, mitigation, likelihood, impact, title, description } = await req.json();

  const risk = await prisma.risk.update({
    where: { id: riskId },
    data: {
      status: status ?? undefined,
      mitigation: mitigation !== undefined ? (mitigation?.trim() || null) : undefined,
      likelihood: likelihood ?? undefined,
      impact: impact ?? undefined,
      title: title?.trim() ?? undefined,
      description: description !== undefined ? (description?.trim() || null) : undefined,
    },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
  });

  return Response.json(risk);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ riskId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { riskId } = await params;
  await prisma.risk.update({ where: { id: riskId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
