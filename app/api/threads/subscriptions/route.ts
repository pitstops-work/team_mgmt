import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const subs = await prisma.threadSubscription.findMany({
    where: { userId: session.user.id },
    select: { threadId: true },
  });

  return Response.json(subs);
}
