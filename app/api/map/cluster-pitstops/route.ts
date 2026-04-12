import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const clusterParam = new URL(request.url).searchParams.get("cluster");
  if (!clusterParam) return NextResponse.json({ error: "Missing cluster" }, { status: 400 });

  // Normalise: KR_Market → "KR Market" for DB lookup
  const clusterName = clusterParam.replace(/_/g, " ");

  const cluster = await prisma.cluster.findFirst({
    where: {
      name: { equals: clusterName, mode: "insensitive" },
      deletedAt: null,
    },
  });

  if (!cluster) return NextResponse.json([]);

  // Query goals tagged to this cluster, include their active pitstops
  const goals = await prisma.goal.findMany({
    where: {
      deletedAt: null,
      clusters: { some: { clusterId: cluster.id } },
    },
    include: {
      pitstops: {
        where: {
          deletedAt: null,
          status: { not: "Done" },
        },
        orderBy: { order: "asc" },
        take: 5,
        select: { id: true, title: true, status: true, targetDate: true },
      },
    },
  });

  const result = goals.map((goal) => ({
    goalId: goal.id,
    goalTitle: goal.title,
    goalStatus: goal.status,
    pitstops: goal.pitstops.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      targetDate: p.targetDate?.toISOString() ?? null,
    })),
  }));

  return NextResponse.json(result);
}
