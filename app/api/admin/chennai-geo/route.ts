import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
