import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTemplate } from "@/lib/templates";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = getTemplate(id);
  if (!template) return Response.json({ error: "Template not found" }, { status: 404 });

  const body = await req.json();
  const { title, description, targetDate, startDate, params: templateParams } = body;

  if (!title) return Response.json({ error: "Title required" }, { status: 400 });
  if (!targetDate) return Response.json({ error: "Target date required" }, { status: 400 });
  if (!startDate) return Response.json({ error: "Start date required" }, { status: 400 });

  const pitstopTemplates = template.build(templateParams ?? {});
  const goalStart = new Date(startDate);

  const goal = await prisma.goal.create({
    data: {
      title,
      description: description ?? null,
      status: "Active",
      ownerId: session.user.id,
      targetDate: new Date(targetDate),
      pitstops: {
        create: pitstopTemplates.map((pt, idx) => {
          const pitstopStart = new Date(goalStart);
          pitstopStart.setDate(pitstopStart.getDate() + pt.startSlaDays);
          const pitstopTarget = new Date(goalStart);
          pitstopTarget.setDate(pitstopTarget.getDate() + pt.slaDays);

          // Map template type string to PitstopType enum, fallback to Discussion
          const validTypes = [
            "Meeting", "Training", "SiteVisit", "Discussion",
            "AppDevelopment", "Budgeting", "Proposal", "Research", "Review", "Custom",
          ];
          const pitstopType = validTypes.includes(pt.type) ? pt.type : "Discussion";

          return {
            title: pt.title,
            type: pitstopType as any,
            notes: pt.notes,
            order: idx,
            ownerId: session.user.id,
            ownerInherited: true,
            startDate: pitstopStart,
            targetDate: pitstopTarget,
            checklistItems: {
              create: pt.checklist.map((item, itemIdx) => ({
                text: item.text,
                order: itemIdx,
              })),
            },
          };
        }),
      },
    },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      pitstops: { select: { id: true, status: true } },
    },
  });

  // Goal owner auto-follows
  await prisma.goalFollow.upsert({
    where: { userId_goalId: { userId: session.user.id, goalId: goal.id } },
    create: { userId: session.user.id, goalId: goal.id },
    update: {},
  });

  return Response.json(goal, { status: 201 });
}
