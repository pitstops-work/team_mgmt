import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clusterParam = url.searchParams.get("cluster");
  const zoneParam    = url.searchParams.get("zone");

  if (!clusterParam && !zoneParam) {
    return NextResponse.json({ error: "Missing cluster or zone" }, { status: 400 });
  }

  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Build the pitstop → goal → geography filter
  const geoFilter = clusterParam
    ? {
        pitstop: {
          goal: {
            deletedAt: null,
            clusters: {
              some: {
                cluster: {
                  name: { equals: clusterParam.replace(/_/g, " "), mode: "insensitive" as const },
                },
              },
            },
          },
        },
      }
    : {
        pitstop: {
          goal: {
            deletedAt: null,
            zones: {
              some: {
                zone: {
                  name: { equals: zoneParam!, mode: "insensitive" as const },
                },
              },
            },
          },
        },
      };

  const events = await prisma.pitstopEvent.findMany({
    where: {
      deletedAt: null,
      scheduledAt: { gte: sixtyDaysAgo, lte: thirtyDaysAhead },
      pitstops: { some: geoFilter },
    },
    select: {
      id: true, title: true, type: true, status: true, scheduledAt: true, location: true,
      pitstops: {
        select: {
          pitstop: {
            select: {
              id: true, title: true,
              goal: { select: { id: true, title: true } },
            },
          },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });

  return NextResponse.json(events);
}
