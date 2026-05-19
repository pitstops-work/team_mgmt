import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { adminForbidden } from "@/lib/roleGuard";

// GET /api/admin/settings?prefix=xxx — return all AppSetting rows where key starts with prefix
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("prefix") ?? "";

  const rows = await prisma.appSetting.findMany({
    where: prefix ? { key: { startsWith: prefix } } : undefined,
    orderBy: { key: "asc" },
  });

  return Response.json(rows);
}

// PATCH /api/admin/settings — body: [{ key, value }] — upsert each key
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const updates: { key: string; value: string }[] = await req.json();

  await Promise.all(
    updates.map(({ key, value }) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  return Response.json({ ok: true });
}
