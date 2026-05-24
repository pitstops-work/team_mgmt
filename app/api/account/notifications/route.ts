import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailOptIn: true, email: true },
  });
  const pushSubs = await prisma.pushSubscription.count({
    where: { userId: session.user.id },
  });

  return Response.json({
    emailOptIn: user?.emailOptIn ?? false,
    email: user?.email ?? null,
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

  const data: { emailOptIn?: boolean } = {};
  if (typeof body.emailOptIn === "boolean") data.emailOptIn = body.emailOptIn;

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { emailOptIn: true },
  });

  return Response.json({ user });
}
