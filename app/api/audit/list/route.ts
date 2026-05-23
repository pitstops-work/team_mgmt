import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const action = searchParams.get("action");
  const actorId = searchParams.get("actorId");
  const cursor = searchParams.get("cursor");

  // Catalog row 16: admin sees own actions + entries about own user.
  // super-admin sees all.
  const where: Record<string, unknown> = {};
  if (!isSuperAdmin(session)) {
    where.OR = [
      { userId: session!.user!.id },
      { entityType: "User", entityId: session!.user!.id },
    ];
  }
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (actorId) where.userId = actorId;

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > PAGE_SIZE;
  const items = hasMore ? logs.slice(0, PAGE_SIZE) : logs;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return Response.json({ items, nextCursor });
}
