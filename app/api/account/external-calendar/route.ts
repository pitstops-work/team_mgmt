import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { externalCalendarUrl: true },
  });
  return Response.json({ url: user?.externalCalendarUrl ?? null });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await req.json();

  // Basic validation — must be empty string (to clear) or an https URL ending in .ics
  if (url && typeof url === "string" && url.trim()) {
    try {
      const parsed = new URL(url.trim());
      if (!["https:", "http:", "webcal:"].includes(parsed.protocol)) {
        return Response.json({ error: "URL must be http, https, or webcal" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "Invalid URL" }, { status: 400 });
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { externalCalendarUrl: url?.trim() || null },
  });

  return Response.json({ ok: true });
}
