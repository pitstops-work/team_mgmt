import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { whatsappOptIn: true, phone: true },
  });
  const pushSubs = await prisma.pushSubscription.count({
    where: { userId: session.user.id },
  });

  return Response.json({
    whatsappOptIn: user?.whatsappOptIn ?? false,
    phone: user?.phone ?? null,
    pushSubscribed: pushSubs > 0,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: { whatsappOptIn?: boolean; phone?: string | null } = {};
  if (typeof body.whatsappOptIn === "boolean") data.whatsappOptIn = body.whatsappOptIn;
  if (typeof body.phone === "string") data.phone = body.phone.trim() || null;
  else if (body.phone === null) data.phone = null;

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { whatsappOptIn: true, phone: true },
  });

  return Response.json({ user });
}
