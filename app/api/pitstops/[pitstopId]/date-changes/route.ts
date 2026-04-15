import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pitstopId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const changes = await prisma.pitstopDateChange.findMany({
    where: { pitstopId },
    orderBy: { createdAt: "asc" },
    include: { changedBy: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json(changes);
}
