import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import type { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const steward = await isWikiSteward(userId);
  if (!steward) return Response.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      whatsappOptIn: true,
      designation: true,
    },
    orderBy: { name: "asc" },
  });

  return Response.json({ users });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const steward = await isWikiSteward(userId);
  if (!steward) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.updates)) {
    return Response.json({ error: "updates array required" }, { status: 400 });
  }

  const updates = body.updates
    .map((u: unknown) => {
      if (!u || typeof u !== "object") return null;
      const rec = u as { userId?: unknown; phone?: unknown };
      if (typeof rec.userId !== "string") return null;
      const phone = typeof rec.phone === "string" ? rec.phone.trim() : null;
      return { userId: rec.userId, phone: phone || null };
    })
    .filter((u: { userId: string; phone: string | null } | null): u is { userId: string; phone: string | null } => u !== null);

  if (updates.length === 0) {
    return Response.json({ error: "no valid updates" }, { status: 400 });
  }

  // Apply sequentially — small batch, prefer correctness over throughput.
  let applied = 0;
  for (const u of updates) {
    try {
      await prisma.user.update({
        where: { id: u.userId },
        data: { phone: u.phone },
      });
      applied++;
    } catch {
      // ignore — likely a stale userId; skip silently
    }
  }

  return Response.json({ ok: true, applied });
}
