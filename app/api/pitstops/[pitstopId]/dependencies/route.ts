import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST: add a blocker (this pitstop is blocked by blockedById)
export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { blockedById } = await req.json();
  if (!blockedById) return Response.json({ error: "blockedById required" }, { status: 400 });
  if (blockedById === pitstopId) return Response.json({ error: "A pitstop cannot block itself" }, { status: 400 });

  const dep = await prisma.pitstopDependency.upsert({
    where: { blockedId_blockedById: { blockedId: pitstopId, blockedById } },
    create: { blockedId: pitstopId, blockedById },
    update: {},
  });

  return Response.json(dep, { status: 201 });
}

// DELETE: remove a blocker
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { blockedById } = await req.json();

  await prisma.pitstopDependency.deleteMany({
    where: { blockedId: pitstopId, blockedById },
  });

  return Response.json({ ok: true });
}
