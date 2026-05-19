import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roleGuard";

export async function GET() {
  const session = await auth();
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const city = await prisma.city.findFirst({
    where: { name: { contains: "Chennai" } },
    include: {
      zones: {
        where: { deletedAt: null },
        include: {
          clusters: {
            where: { deletedAt: null },
            include: {
              settlements: { where: { deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } },
            },
            orderBy: { name: "asc" },
          },
        },
        orderBy: { name: "asc" },
      },
    },
  });

  return NextResponse.json(city);
}
