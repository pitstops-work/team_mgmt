import { createAnthropic } from "@ai-sdk/anthropic";
import { ToolLoopAgent, createAgentUIStreamResponse, stepCountIs, zodSchema } from "ai";
import { z } from "zod/v3";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roleGuard";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are the private AI agent for the admin of Pitstop — a programme and field coverage management app used by a small urban development NGO working with low-income communities across Indian cities.

You have full, live access to the organisation's database through tools. Use them whenever you need data — never guess or fabricate. You can chain multiple tool calls freely to complete complex, multi-step tasks.

## Your capabilities
- Analyse goals, pitstops, activities, field coverage gaps, and team workload
- Plan field visits with optimised routing and scheduling using real settlement coordinates
- Create goals, pitstops, and activities directly in the database
- Identify programme risks, coverage deficits, overdue work, and team capacity issues
- Draft reports and strategic summaries grounded in real data

## Behaviour
- Always call the relevant tool(s) before answering factual questions — do not guess
- Chain tool calls freely — fetch geography first, then settlements, then plan
- Be direct, specific, and action-oriented
- Flag overdue items with ⚠ and coverage gaps clearly
- When creating records, confirm exactly what was created
- Today is ${new Date().toISOString().slice(0, 10)}`;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const agentTools = {
  get_goals: {
    description: "Fetch goals with optional filters. Returns goals with pitstops, owner, geography, and programmes.",
    inputSchema: zodSchema(z.object({
      status: z.enum(["Active", "Paused", "Complete", "all"]).optional(),
      search: z.string().optional().describe("Search in title/description"),
      zoneId: z.string().optional(),
      clusterId: z.string().optional(),
    })),
    execute: async ({ status, search, zoneId, clusterId }: { status?: "Active" | "Paused" | "Complete" | "all"; search?: string; zoneId?: string; clusterId?: string }) => {
      const now = new Date();
      const goals = await prisma.goal.findMany({
        where: {
          deletedAt: null,
          ...(status && status !== "all" ? { status } : {}),
          ...(zoneId ? { needsZoneId: zoneId } : {}),
          ...(clusterId ? { needsClusterId: clusterId } : {}),
          ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] } : {}),
        },
        include: {
          owner: { select: { id: true, name: true } },
          pitstops: {
            where: { deletedAt: null },
            select: { id: true, title: true, status: true, targetDate: true, type: true, owner: { select: { name: true } } },
            orderBy: { order: "asc" },
          },
          programs: { select: { program: { select: { id: true, title: true } } } },
          needsZone: { select: { id: true, name: true } },
          needsCluster: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 60,
      });
      return goals.map(g => ({
        id: g.id,
        title: g.title,
        status: g.status,
        owner: g.owner?.name,
        targetDate: g.targetDate?.toISOString().slice(0, 10),
        description: g.description?.slice(0, 300),
        zone: g.needsZone?.name,
        cluster: g.needsCluster?.name,
        programs: g.programs.map(p => p.program.title),
        pitstops: g.pitstops.map(p => ({
          id: p.id,
          title: p.title,
          type: p.type,
          status: p.status,
          owner: p.owner?.name,
          dueDate: p.targetDate?.toISOString().slice(0, 10),
          overdue: p.status !== "Done" && !!p.targetDate && new Date(p.targetDate) < now,
        })),
      }));
    },
  },

  get_people: {
    description: "Fetch all team members with their current active pitstop workload and overdue count.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const now = new Date();
      const users = await prisma.user.findMany({
        select: {
          id: true, name: true, email: true, role: true,
          ownedPitstops: {
            where: { deletedAt: null, status: { in: ["Upcoming", "InProgress"] } },
            select: { id: true, status: true, targetDate: true },
          },
        },
        orderBy: { name: "asc" },
      });
      return users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        activePitstops: u.ownedPitstops.length,
        overduePitstops: u.ownedPitstops.filter(p => p.targetDate && new Date(p.targetDate) < now).length,
      }));
    },
  },

  get_geography: {
    description: "Fetch city → zone → cluster hierarchy with settlement and coverage counts. Call this first when user mentions geography, zones, or clusters.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const zones = await prisma.zone.findMany({
        where: { deletedAt: null },
        include: {
          city: { select: { id: true, name: true } },
          clusters: {
            where: { deletedAt: null },
            include: {
              settlements: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  needsGoals: { where: { deletedAt: null, status: "Active" }, select: { id: true } },
                },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });
      return zones.map(z => ({
        id: z.id,
        name: z.name,
        city: z.city?.name,
        cityId: z.cityId,
        clusters: z.clusters.map(c => ({
          id: c.id,
          name: c.name,
          totalSettlements: c.settlements.length,
          settlementsWithGoals: c.settlements.filter(s => s.needsGoals.length > 0).length,
          uncoveredSettlements: c.settlements.filter(s => s.needsGoals.length === 0).length,
        })),
        totalSettlements: z.clusters.flatMap(c => c.settlements).length,
        settlementsWithGoals: z.clusters.flatMap(c => c.settlements).filter(s => s.needsGoals.length > 0).length,
      }));
    },
  },

  get_settlements: {
    description: "Fetch settlements with coordinates, profile data, and active goals. Use for visit planning or settlement-level coverage analysis.",
    inputSchema: zodSchema(z.object({
      clusterId: z.string().optional(),
      zoneId: z.string().optional(),
      cityId: z.string().optional(),
      withCoordinatesOnly: z.boolean().optional().describe("Only return settlements that have lat/lng coordinates"),
    })),
    execute: async ({ clusterId, zoneId, cityId, withCoordinatesOnly }: { clusterId?: string; zoneId?: string; cityId?: string; withCoordinatesOnly?: boolean }) => {
      const settlements = await prisma.settlement.findMany({
        where: {
          deletedAt: null,
          ...(clusterId ? { clusterId } : {}),
          ...(cityId ? { cityId } : {}),
          ...(zoneId ? { cluster: { zoneId } } : {}),
          ...(withCoordinatesOnly ? { centroidLat: { not: null }, centroidLng: { not: null } } : {}),
        },
        include: {
          cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
          profile: { select: { totalHouseholds: true, settlementType: true, priorityIssues: true } },
          needsGoals: { where: { deletedAt: null, status: "Active" }, select: { id: true, title: true } },
        },
        orderBy: [{ cluster: { zone: { name: "asc" } } }, { name: "asc" }],
        take: 200,
      });
      return settlements.map(s => ({
        id: s.id,
        name: s.name,
        lat: s.centroidLat,
        lng: s.centroidLng,
        hasCoordinates: s.centroidLat !== null,
        cluster: s.cluster.name,
        clusterId: s.clusterId,
        zone: s.cluster.zone.name,
        zoneId: s.cluster.zone.id,
        households: s.profile?.totalHouseholds ?? 0,
        type: s.profile?.settlementType,
        priorityIssues: s.profile?.priorityIssues,
        activeGoalsCount: s.needsGoals.length,
        activeGoals: s.needsGoals.map(g => g.title),
      }));
    },
  },

  get_activities: {
    description: "Fetch scheduled activities/events. Filter by date range or upcoming only.",
    inputSchema: zodSchema(z.object({
      from: z.string().optional().describe("YYYY-MM-DD"),
      to: z.string().optional().describe("YYYY-MM-DD"),
      upcomingOnly: z.boolean().optional(),
    })),
    execute: async ({ from, to, upcomingOnly }: { from?: string; to?: string; upcomingOnly?: boolean }) => {
      const now = new Date();
      const events = await prisma.pitstopEvent.findMany({
        where: {
          deletedAt: null,
          ...(upcomingOnly ? { scheduledAt: { gte: now } } : {}),
          ...(from ? { scheduledAt: { gte: new Date(from) } } : {}),
          ...(to ? { scheduledAt: { lte: new Date(to + "T23:59:59") } } : {}),
        },
        include: {
          attendees: { include: { user: { select: { name: true } } } },
          pitstops: { select: { pitstop: { select: { title: true, goal: { select: { title: true } } } } } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 50,
      });
      return events.map(e => ({
        id: e.id,
        title: e.title,
        type: e.type,
        status: e.status,
        scheduledAt: e.scheduledAt.toISOString().slice(0, 16).replace("T", " "),
        location: e.location,
        attendees: e.attendees.map(a => a.user.name),
        linkedTo: e.pitstops.map(p => `${p.pitstop.title} → ${p.pitstop.goal.title}`),
      }));
    },
  },

  get_programs: {
    description: "Fetch all programmes with their goals and pitstop progress.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const programs = await prisma.program.findMany({
        where: { deletedAt: null },
        include: {
          goals: {
            include: {
              goal: {
                select: {
                  id: true, title: true, status: true, targetDate: true,
                  pitstops: { where: { deletedAt: null }, select: { status: true } },
                },
              },
            },
          },
        },
        orderBy: { title: "asc" },
      });
      return programs.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        goals: p.goals.map(pg => ({
          id: pg.goal.id,
          title: pg.goal.title,
          status: pg.goal.status,
          targetDate: pg.goal.targetDate?.toISOString().slice(0, 10),
          pitstopsTotal: pg.goal.pitstops.length,
          pitstopsDone: pg.goal.pitstops.filter(ps => ps.status === "Done").length,
        })),
      }));
    },
  },

  plan_visit_route: {
    description: "Given settlement IDs, compute an optimised visit route using nearest-neighbour ordering. Returns ordered stops with estimated travel times and a full day schedule.",
    inputSchema: zodSchema(z.object({
      settlementIds: z.array(z.string()).describe("Settlement IDs — from get_settlements"),
      startLat: z.number().optional().describe("Starting point latitude (office/base). If omitted, starts from first settlement."),
      startLng: z.number().optional(),
      dwellMinutesPerStop: z.number().optional().describe("Minutes spent at each stop, default 45"),
      startTime: z.string().optional().describe("HH:MM, default 09:00"),
      date: z.string().optional().describe("YYYY-MM-DD for the plan header"),
    })),
    execute: async ({ settlementIds, startLat, startLng, dwellMinutesPerStop = 45, startTime = "09:00", date }: {
      settlementIds: string[]; startLat?: number; startLng?: number; dwellMinutesPerStop?: number; startTime?: string; date?: string;
    }) => {
      const settlements = await prisma.settlement.findMany({
        where: { id: { in: settlementIds }, centroidLat: { not: null }, centroidLng: { not: null } },
        include: {
          cluster: { select: { name: true, zone: { select: { name: true } } } },
          profile: { select: { totalHouseholds: true, settlementType: true } },
          needsGoals: { where: { deletedAt: null, status: "Active" }, select: { title: true } },
        },
      });

      if (settlements.length === 0) return { error: "No settlements with coordinates found." };

      let remaining = [...settlements];
      const ordered: typeof settlements = [];
      let curLat = startLat ?? settlements[0].centroidLat!;
      let curLng = startLng ?? settlements[0].centroidLng!;

      while (remaining.length > 0) {
        let nearest = remaining[0];
        let minDist = Infinity;
        for (const s of remaining) {
          const d = haversineKm(curLat, curLng, s.centroidLat!, s.centroidLng!);
          if (d < minDist) { minDist = d; nearest = s; }
        }
        ordered.push(nearest);
        curLat = nearest.centroidLat!;
        curLng = nearest.centroidLng!;
        remaining = remaining.filter(s => s.id !== nearest.id);
      }

      const [h0, m0] = startTime.split(":").map(Number);
      let cursor = h0 * 60 + m0;

      const stops = ordered.map((s, i) => {
        const prevLat = i === 0 ? (startLat ?? s.centroidLat!) : ordered[i - 1].centroidLat!;
        const prevLng = i === 0 ? (startLng ?? s.centroidLng!) : ordered[i - 1].centroidLng!;
        const travelKm = i === 0 && !startLat ? 0 : haversineKm(prevLat, prevLng, s.centroidLat!, s.centroidLng!);
        const travelMins = Math.round((travelKm / 25) * 60);
        cursor += travelMins;
        const arrival = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
        const dwell = (s.profile?.totalHouseholds ?? 0) > 200 ? dwellMinutesPerStop + 15 : dwellMinutesPerStop;
        cursor += dwell;
        const departure = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
        return {
          stop: i + 1, id: s.id, name: s.name,
          cluster: s.cluster.name, zone: s.cluster.zone.name,
          households: s.profile?.totalHouseholds ?? 0,
          type: s.profile?.settlementType,
          activeGoals: s.needsGoals.map(g => g.title),
          travelFromPrevKm: Math.round(travelKm * 10) / 10,
          travelMins, arrivalTime: arrival, departureTime: departure, dwellMins: dwell,
        };
      });

      return {
        date: date ?? new Date().toISOString().slice(0, 10),
        totalStops: stops.length,
        totalKm: Math.round(stops.reduce((s, x) => s + x.travelFromPrevKm, 0) * 10) / 10,
        startTime,
        endTime: `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`,
        stops,
      };
    },
  },

  create_goal: {
    description: "Create a new goal in the database.",
    inputSchema: zodSchema(z.object({
      title: z.string(),
      description: z.string().optional(),
      targetDate: z.string().optional().describe("YYYY-MM-DD"),
      ownerId: z.string().optional().describe("User ID from get_people — defaults to admin"),
      zoneId: z.string().optional().describe("Zone ID from get_geography"),
      clusterId: z.string().optional(),
      needsDomain: z.string().optional().describe("Domain key e.g. water, health, sanitation"),
    })),
    execute: async ({ title, description, targetDate, ownerId, zoneId, clusterId, needsDomain }: {
      title: string; description?: string; targetDate?: string; ownerId?: string; zoneId?: string; clusterId?: string; needsDomain?: string;
    }) => {
      const session = await auth();
      const goal = await prisma.goal.create({
        data: {
          title, description: description ?? null, status: "Active",
          targetDate: targetDate ? new Date(targetDate) : null,
          ownerId: ownerId ?? session!.user!.id!,
          needsZoneId: zoneId ?? null,
          needsClusterId: clusterId ?? null,
          needsDomain: needsDomain ?? null,
        },
      });
      return { created: true, id: goal.id, title: goal.title, url: `/goals/${goal.id}` };
    },
  },

  create_pitstop: {
    description: "Add a pitstop (milestone/task) to an existing goal.",
    inputSchema: zodSchema(z.object({
      goalId: z.string().describe("Goal ID from get_goals"),
      title: z.string(),
      type: z.enum(["Meeting", "Training", "SiteVisit", "Discussion", "Budgeting", "Proposal", "Research"]).optional(),
      targetDate: z.string().optional().describe("YYYY-MM-DD"),
      startDate: z.string().optional().describe("YYYY-MM-DD"),
      ownerId: z.string().optional(),
      notes: z.string().optional(),
    })),
    execute: async ({ goalId, title, type, targetDate, startDate, ownerId, notes }: {
      goalId: string; title: string; type?: string; targetDate?: string; startDate?: string; ownerId?: string; notes?: string;
    }) => {
      const session = await auth();
      const count = await prisma.pitstop.count({ where: { goalId, deletedAt: null } });
      const pitstop = await prisma.pitstop.create({
        data: {
          goalId, title, type: (type ?? "Meeting") as "Meeting",
          status: "Upcoming",
          targetDate: targetDate ? new Date(targetDate) : null,
          startDate: startDate ? new Date(startDate) : null,
          ownerId: ownerId ?? session!.user!.id!,
          notes: notes ?? null,
          order: count + 1,
        },
      });
      return { created: true, id: pitstop.id, title: pitstop.title, goalId };
    },
  },

  create_activity: {
    description: "Create a scheduled activity/event (field visit, meeting, etc.).",
    inputSchema: zodSchema(z.object({
      title: z.string(),
      type: z.enum(["Meeting", "Visit", "Event"]).optional(),
      scheduledAt: z.string().describe("YYYY-MM-DDTHH:MM"),
      endsAt: z.string().optional(),
      location: z.string().optional(),
      description: z.string().optional(),
      attendeeIds: z.array(z.string()).optional().describe("User IDs from get_people"),
    })),
    execute: async ({ title, type, scheduledAt, endsAt, location, description, attendeeIds }: {
      title: string; type?: "Meeting" | "Visit" | "Event"; scheduledAt: string; endsAt?: string; location?: string; description?: string; attendeeIds?: string[];
    }) => {
      const session = await auth();
      const event = await prisma.pitstopEvent.create({
        data: {
          title, type: (type ?? "Visit") as "Visit",
          scheduledAt: new Date(scheduledAt),
          endsAt: endsAt ? new Date(endsAt) : null,
          location: location ?? null,
          description: description ?? null,
          createdById: session!.user!.id!,
          ...(attendeeIds?.length ? { attendees: { create: attendeeIds.map(userId => ({ userId })) } } : {}),
        },
      });
      return { created: true, id: event.id, title: event.title, scheduledAt: event.scheduledAt.toISOString() };
    },
  },
} as const;

const agent = new ToolLoopAgent({
  model: anthropic("claude-sonnet-4-6"),
  instructions: SYSTEM,
  tools: agentTools,
  stopWhen: stepCountIs(12),
  temperature: 0.3,
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}
