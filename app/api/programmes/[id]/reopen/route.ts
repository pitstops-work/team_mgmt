import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.$executeRaw`
    UPDATE "ProgrammeJourney" SET
      status = 'Active',
      "closedAt" = NULL,
      "closedReason" = NULL,
      "closedById" = NULL,
      "outcomeSnapshot" = NULL,
      "updatedAt" = NOW()
    WHERE id = ${id}
  `;
  return Response.json({ ok: true });
}
