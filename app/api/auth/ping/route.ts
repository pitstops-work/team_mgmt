import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST /api/auth/ping — updates lastSeenAt for the current user.
// Called once per page load from the client to track "last active".
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ ok: false }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenAt: new Date() },
  });

  return Response.json({ ok: true });
}
