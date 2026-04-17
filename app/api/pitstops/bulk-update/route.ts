import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PitstopStatus } from "@/app/generated/prisma/client";

// POST /api/pitstops/bulk-update
// Body: { ids: string[]; updates: { status?: string } }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, updates } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "ids required" }, { status: 400 });
  }

  const data: { status?: PitstopStatus; completedAt?: Date | null } = {};
  if (updates.status && Object.values(PitstopStatus).includes(updates.status)) {
    data.status = updates.status as PitstopStatus;
    data.completedAt = updates.status === "Done" ? new Date() : null;
  }

  await prisma.pitstop.updateMany({ where: { id: { in: ids } }, data });

  return Response.json({ ok: true });
}
