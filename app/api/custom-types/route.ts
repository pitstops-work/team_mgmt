import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const types = await prisma.customPitstopType.findMany({ orderBy: { name: "asc" } });
  return Response.json(types);
}
