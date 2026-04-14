import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NeedsDomain } from "@/app/generated/prisma/enums";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.needsFormulaConfig.findMany({ orderBy: { domain: "asc" } });
  return Response.json(rows);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const updates: { domain: string; denominator: number }[] = await req.json();

  await Promise.all(
    updates.map(({ domain, denominator }) =>
      prisma.needsFormulaConfig.upsert({
        where: { domain: domain as NeedsDomain },
        update: { denominator },
        create: { domain: domain as NeedsDomain, denominator },
      })
    )
  );

  const rows = await prisma.needsFormulaConfig.findMany({ orderBy: { domain: "asc" } });
  return Response.json(rows);
}
