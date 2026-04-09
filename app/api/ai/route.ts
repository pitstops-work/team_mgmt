import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function buildContext(userId: string): Promise<string> {
  const [goals, events, users] = await Promise.all([
    prisma.goal.findMany({
      where: { deletedAt: null },
      include: {
        owner: { select: { id: true, name: true } },
        pitstops: {
          where: { deletedAt: null },
          include: {
            owner: { select: { id: true, name: true } },
            checklistItems: { orderBy: { order: "asc" } },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pitstopEvent.findMany({
      where: { deletedAt: null },
      include: {
        pitstops: { select: { pitstop: { select: { id: true, title: true, goal: { select: { title: true } } } } } },
        attendees: { include: { user: { select: { name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const me = users.find(u => u.id === userId);

  let ctx = `CURRENT USER: ${me?.name ?? "Unknown"}\n\n`;
  ctx += `TEAM MEMBERS: ${users.map(u => u.name).join(", ")}\n\n`;

  ctx += `GOALS & PITSTOPS:\n`;
  for (const g of goals) {
    const totalPitstops = g.pitstops.length;
    const donePitstops = g.pitstops.filter(p => p.status === "Done").length;
    ctx += `\nGoal: "${g.title}" | Status: ${g.status} | Owner: ${g.owner?.name ?? "Unassigned"} | Target: ${g.targetDate ? new Date(g.targetDate).toISOString().slice(0, 10) : "none"} | Progress: ${donePitstops}/${totalPitstops} pitstops done\n`;
    for (const p of g.pitstops) {
      const totalItems = p.checklistItems.length;
      const doneItems = p.checklistItems.filter(c => c.checked).length;
      const checklist = totalItems > 0 ? ` | Checklist: ${doneItems}/${totalItems} done` : "";
      const start = p.startDate ? ` | Start: ${new Date(p.startDate).toISOString().slice(0, 10)}` : "";
      const target = p.targetDate ? ` | Due: ${new Date(p.targetDate).toISOString().slice(0, 10)}` : "";
      const owner = p.owner ? ` | Owner: ${p.owner.name}` : "";
      ctx += `  - Pitstop: "${p.title}" | ${p.type} | Status: ${p.status}${start}${target}${owner}${checklist}\n`;
    }
  }

  if (events.length > 0) {
    ctx += `\nSCHEDULED EVENTS:\n`;
    for (const ev of events) {
      const date = new Date(ev.scheduledAt).toISOString().slice(0, 16).replace("T", " ");
      const pitstopRef = ev.pitstops.length > 0 ? ` | Pitstops: ${ev.pitstops.map(p => `"${p.pitstop.title}" (${p.pitstop.goal.title})`).join(", ")}` : "";
      const attendeeList = ev.attendees.map(a => a.user.name).join(", ");
      ctx += `  - "${ev.title}" | ${ev.type} | ${date}${pitstopRef} | Attendees: ${attendeeList}\n`;
    }
  }

  return ctx;
}

const SYSTEM_PROMPT = `You are an AI assistant built exclusively for Pitstop — a team goal and pitstop management app used by a small organisation.

Your job is to help the team manage their goals, pitstops (milestones), checklists, schedules, and events more effectively.

You have access to REAL-TIME data from the app injected below. Base ALL your answers strictly on this data.

RULES:
- Never invent progress, dates, names, or statuses. Only use what is in the data.
- If you don't have enough information to answer, say so clearly.
- Be concise, practical, and specific. No generic advice.
- When suggesting pitstop breakdowns or checklists, be realistic about scope and time.
- When calendarizing, respect existing target dates and suggest start dates that give adequate lead time.
- When suggesting events or meetings, tie them to specific pitstops and suggest realistic attendees from the team.
- Format responses with clear headings and bullet points where helpful.
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
    max_tokens: 1500,
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
