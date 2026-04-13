import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function fmt(date: Date | string | null | undefined): string {
  if (!date) return "none";
  return new Date(date).toISOString().slice(0, 10);
}

async function buildContext(userId: string): Promise<string> {
  const today = new Date();

  const [goals, events, users, themes, risks, programs, zones, clusters, recentNotes, decisions] = await Promise.all([
    prisma.goal.findMany({
      where: { deletedAt: null },
      include: {
        owner: { select: { id: true, name: true } },
        programs: { select: { program: { select: { name: true } } } },
        themes: { select: { theme: { select: { name: true } } } },
        zones: { select: { zone: { select: { name: true } } } },
        clusters: { select: { cluster: { select: { name: true } } } },
        metrics: {
          select: {
            name: true, unit: true, target: true,
            dataPoints: { orderBy: { date: "desc" }, take: 1, select: { value: true, date: true } },
          },
        },
        pitstops: {
          where: { deletedAt: null },
          include: {
            owner: { select: { id: true, name: true } },
            checklistItems: { orderBy: { order: "asc" } },
            themes: { select: { theme: { select: { name: true } } } },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pitstopEvent.findMany({
      where: { deletedAt: null, scheduledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      include: {
        pitstops: { select: { pitstop: { select: { id: true, title: true, goal: { select: { title: true } } } } } },
        attendees: { include: { user: { select: { name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.theme.findMany({
      where: { deletedAt: null },
      select: { name: true, pitstops: { select: { pitstop: { select: { goal: { select: { title: true } } } } } } },
    }),
    prisma.risk.findMany({
      where: { deletedAt: null },
      select: {
        title: true, likelihood: true, impact: true, status: true,
        goal: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.program.findMany({
      where: { deletedAt: null },
      select: { name: true, goals: { select: { goal: { select: { title: true, status: true } } } } },
    }),
    prisma.zone.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    prisma.cluster.findMany({
      select: { name: true, zone: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.standupLog.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.decision.findMany({
      where: { deletedAt: null },
      select: { title: true, status: true, goal: { select: { title: true } }, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const me = users.find(u => u.id === userId);

  let ctx = `CURRENT USER: ${me?.name ?? "Unknown"}\n`;
  ctx += `TEAM: ${users.map(u => u.name).join(", ")}\n\n`;

  // ── Programs ──────────────────────────────────────────────────────────────
  if (programs.length > 0) {
    ctx += `PROGRAMS:\n`;
    for (const p of programs) {
      const goalTitles = p.goals.map(g => `"${g.goal.title}" (${g.goal.status})`).join(", ");
      ctx += `  - "${p.name}": ${goalTitles || "no goals"}\n`;
    }
    ctx += "\n";
  }

  // ── Geography ─────────────────────────────────────────────────────────────
  if (zones.length > 0) {
    const clustersByZone = clusters.reduce((acc, c) => {
      const z = c.zone.name;
      if (!acc[z]) acc[z] = [];
      acc[z].push(c.name.replace(/_/g, " "));
      return acc;
    }, {} as Record<string, string[]>);
    ctx += `GEOGRAPHY:\n`;
    for (const z of zones) {
      const cs = clustersByZone[z.name]?.join(", ") ?? "no clusters";
      ctx += `  - Zone: ${z.name} → Clusters: ${cs}\n`;
    }
    ctx += "\n";
  }

  // ── Themes ────────────────────────────────────────────────────────────────
  if (themes.length > 0) {
    ctx += `THEMES:\n`;
    for (const t of themes) {
      const goalSet = new Set(t.pitstops.map(p => p.pitstop.goal.title));
      ctx += `  - "${t.name}": spans goals: ${[...goalSet].map(g => `"${g}"`).join(", ") || "none yet"}\n`;
    }
    ctx += "\n";
  }

  // ── Goals & Pitstops ──────────────────────────────────────────────────────
  ctx += `GOALS & PITSTOPS:\n`;
  for (const g of goals) {
    const donePitstops = g.pitstops.filter(p => p.status === "Done").length;
    const totalPitstops = g.pitstops.length;
    const overduePitstops = g.pitstops.filter(p =>
      p.status !== "Done" && p.targetDate && new Date(p.targetDate) < today
    ).length;
    const programNames = g.programs.map(p => p.program.name).join(", ");
    const themeNames = g.themes.map(t => t.theme.name).join(", ");
    const zoneNames = g.zones.map(z => z.zone.name).join(", ");
    const clusterNames = g.clusters.map(c => c.cluster.name.replace(/_/g, " ")).join(", ");

    ctx += `\nGoal: "${g.title}"`;
    ctx += ` | Status: ${g.status} | Owner: ${g.owner?.name ?? "Unassigned"}`;
    ctx += ` | Target: ${fmt(g.targetDate)} | Progress: ${donePitstops}/${totalPitstops} pitstops done`;
    if (overduePitstops > 0) ctx += ` | ⚠ ${overduePitstops} overdue pitstop(s)`;
    if (programNames) ctx += ` | Program: ${programNames}`;
    if (themeNames) ctx += ` | Themes: ${themeNames}`;
    if (zoneNames) ctx += ` | Zones: ${zoneNames}`;
    if (clusterNames) ctx += ` | Clusters: ${clusterNames}`;
    if (g.description) ctx += `\n  Description: ${g.description.slice(0, 200)}`;

    // Metrics
    for (const m of g.metrics) {
      const latest = m.dataPoints[0];
      ctx += `\n  Metric: "${m.name}" | Target: ${m.target ?? "none"} ${m.unit ?? ""}`;
      if (latest) ctx += ` | Latest: ${latest.value} (${fmt(latest.date)})`;
    }

    // Pitstops
    for (const p of g.pitstops) {
      const totalItems = p.checklistItems.length;
      const doneItems = p.checklistItems.filter(c => c.checked).length;
      const isOverdue = p.status !== "Done" && p.targetDate && new Date(p.targetDate) < today;
      const checklist = totalItems > 0 ? ` | Checklist: ${doneItems}/${totalItems}` : "";
      const start = p.startDate ? ` | Start: ${fmt(p.startDate)}` : "";
      const target = p.targetDate ? ` | Due: ${fmt(p.targetDate)}` : "";
      const owner = p.owner ? ` | Owner: ${p.owner.name}` : "";
      const pThemes = p.themes.length ? ` | Themes: ${p.themes.map(t => t.theme.name).join(", ")}` : "";
      const overdueFlag = isOverdue ? " ⚠OVERDUE" : "";
      ctx += `\n  - Pitstop: "${p.title}" | ${p.type} | ${p.status}${overdueFlag}${start}${target}${owner}${checklist}${pThemes}`;
      // Only include checklist detail for active pitstops to save tokens
      if (p.status !== "Done" && totalItems > 0) {
        const unchecked = p.checklistItems.filter(c => !c.checked).map(c => c.text);
        if (unchecked.length > 0) ctx += `\n      Remaining: ${unchecked.slice(0, 5).join(" | ")}${unchecked.length > 5 ? ` (+${unchecked.length - 5} more)` : ""}`;
      }
    }
  }

  // ── Risks ──────────────────────────────────────────────────────────────────
  if (risks.length > 0) {
    ctx += `\n\nRISKS:\n`;
    for (const r of risks) {
      ctx += `  - "${r.title}" | Goal: "${r.goal?.title ?? "none"}" | Likelihood: ${r.likelihood} | Impact: ${r.impact} | Status: ${r.status}\n`;
    }
  }

  // ── Decisions ─────────────────────────────────────────────────────────────
  if (decisions.length > 0) {
    ctx += `\nRECENT DECISIONS:\n`;
    for (const d of decisions) {
      ctx += `  - "${d.title}" | Goal: "${d.goal?.title ?? "none"}" | Status: ${d.status} | Date: ${fmt(d.createdAt)}\n`;
    }
  }

  // ── Upcoming events ────────────────────────────────────────────────────────
  if (events.length > 0) {
    ctx += `\nUPCOMING ACTIVITIES (next 7 days):\n`;
    for (const ev of events) {
      const date = new Date(ev.scheduledAt).toISOString().slice(0, 16).replace("T", " ");
      const pitstopRef = ev.pitstops.length > 0
        ? ` | Linked to: ${ev.pitstops.map(p => `"${p.pitstop.title}" (${p.pitstop.goal.title})`).join(", ")}`
        : "";
      const attendeeList = ev.attendees.map(a => a.user.name).join(", ");
      ctx += `  - "${ev.title}" | ${ev.type} | ${date}${pitstopRef} | Attendees: ${attendeeList}\n`;
    }
  }

  // ── Recent field notes ─────────────────────────────────────────────────────
  if (recentNotes.length > 0) {
    ctx += `\nRECENT FIELD NOTES (last 2 weeks):\n`;
    for (const n of recentNotes) {
      ctx += `  - ${fmt(n.date)} | ${n.user.name}: `;
      if (n.yesterday) ctx += `Done: ${n.yesterday.slice(0, 120)} `;
      if (n.today) ctx += `Next: ${n.today.slice(0, 120)} `;
      if (n.blockers) ctx += `Blockers: ${n.blockers.slice(0, 80)}`;
      ctx += "\n";
    }
  }

  return ctx;
}

const SYSTEM_PROMPT = `You are the built-in AI assistant for Pitstop — a team goal and programme management app used by a small urban development organisation working with communities in Bangalore.

You have access to REAL-TIME data from the app (injected below). Base ALL answers on this data. Never invent names, dates, statuses, or numbers.

## APP FEATURES — know these so you can guide users

**Goals** — High-level objectives. Each has: owner, status (Active/Paused/Complete), target date, description, programme membership, geography (zone/cluster), themes, metrics, and a list of pitstops. Navigate: /goals

**Pitstops** — The steps/milestones inside a goal. Each has: type (Meeting/Workshop/Visit/Training/Report/Review/Other), status (Upcoming/InProgress/Done), start date, target date, owner, checklist items, notes, attachments, themes, and geography tags. Overdue = status≠Done and target date < today. Navigate: /goals/[id]

**Checklists** — Sub-tasks inside a pitstop. Show granular progress. If a pitstop has no checklist, suggest adding one to break the work down.

**Themes** — Cross-cutting tags (e.g. "Livelihoods", "Health") that span pitstops across multiple goals. Useful to see all work on a topic regardless of which goal it lives in. Navigate: /themes

**Programs** — Groups of related goals (e.g. a geographic programme or funding stream). Navigate: /programs

**Geography** — Goals and pitstops can be tagged to Zones (North/South/East/West/Central) and Clusters (sub-areas within zones). This drives the Programme Map and geo-filtered views. Navigate: /geography and /map

**Programme Map** — Interactive map of settlements, resource centres, children/youth centres, and creches. Layers toggle by partner org. Clicking a settlement shows linked goals/pitstops. Navigate: /map

**Risks** — Identified risks linked to goals, with likelihood, impact, status, and owner. If you spot a threat in the data, suggest logging it here. Navigate: /risks

**Decisions** — Key decisions logged with rationale and status. Navigate: /decisions

**Activities** — Scheduled team meetings, field visits, and events linked to pitstops. Syncs to Outlook/Google Calendar via iCal feed. Navigate: /activities

**Fortnightly Review** — Structured review of committed vs delivered pitstops per person. Navigate: /review

**Field Notes (Standup)** — Daily team check-ins: what's done, what's next, blockers. Navigate: /standup

**Planner** — Personal weekly planning tool. Navigate: /planner

**Gantt / Timeline** — Visual timeline of goals and pitstops. Navigate: /gantt and /timeline

**Quarters** — Planning periods that goals can be assigned to. Navigate: /quarters

**Metrics** — Quantitative KPIs per goal with data points over time (e.g. "households reached", "children enrolled"). Suggest adding metrics when a goal lacks measurable outcomes.

**Notifications** — In-app alerts for status changes, mentions, and pitstop assignments. Navigate: /notifications

## RULES
- Never invent progress, dates, names, or statuses. Only use what is in the data.
- If data is missing or insufficient, say so and suggest where in the app to record it.
- Be concise, practical, and specific. No generic advice.
- When you spot missing data (no checklist, no dates, no owner), flag it and say how to fix it in the app.
- When calendarizing, respect existing target dates and suggest realistic start dates.
- When suggesting events, tie them to specific pitstops and suggest realistic attendees from the team list.
- When you spot a risk or blocker in the data, proactively flag it.
- Format responses with clear headings and bullets. Use ⚠ for overdue/at-risk items.
- Today's date is injected at the start of every message — use it for all date calculations.`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { messages } = await req.json();
  if (!messages?.length) return Response.json({ error: "No messages" }, { status: 400 });

  const context = await buildContext(session.user.id);
  const today = new Date().toISOString().slice(0, 10);

  const systemMessage = `${SYSTEM_PROMPT}\n\nToday's date: ${today}\n\n--- APP DATA ---\n${context}--- END APP DATA ---`;

  const stream = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemMessage },
      ...messages,
    ],
    stream: true,
    max_tokens: 2048,
    temperature: 0.3,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
