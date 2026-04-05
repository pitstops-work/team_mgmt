import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true },
  });
  return Response.json({ ok: true });
}
