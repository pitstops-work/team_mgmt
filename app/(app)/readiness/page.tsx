import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ReadinessDashboard from "./ReadinessDashboard";

// Only accessible to the admin user. Set ADMIN_USER_ID in your .env
export default async function ReadinessPage() {
  const session = await auth();

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && session!.user!.email !== adminEmail) {
    redirect("/dashboard");
  }

  const FY_START = new Date("2026-04-01");
  const FY_END   = new Date("2027-03-31");
  const now      = new Date();
  const qAhead   = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [users, goals, planItems] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, image: true, email: true, lastSeenAt: true },
      orderBy: { name: "asc" },
    }),

    prisma.goal.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        ownerId: true,
        pitstops: {
          where: { deletedAt: null },
          select: {
            id: true,
            targetDate: true,
            startDate: true,
            checklistItems: { select: { id: true } },
          },
        },
      },
    }),

    prisma.planItem.findMany({
      where: { deletedAt: null },
      select: { id: true, userId: true, type: true, date: true, title: true },
    }),
  ]);

  // Compute per-user readiness
  const readiness = users.map((user) => {
    const userGoals = goals.filter((g) => g.ownerId === user.id);
    const allPitstops = userGoals.flatMap((g) => g.pitstops);

    const pitstopsWithDate = allPitstops.filter((p) => p.targetDate);
    const fyPitstops = pitstopsWithDate.filter(
      (p) => p.targetDate! >= FY_START && p.targetDate! <= FY_END
    );
    const pitstopsWithChecklist = allPitstops.filter((p) => p.checklistItems.length > 0);

    const targetDates = pitstopsWithDate.map((p) => p.targetDate!).sort((a, b) => +a - +b);
    const minDate = targetDates[0] ?? null;
    const maxDate = targetDates[targetDates.length - 1] ?? null;

    const userPlanItems = planItems.filter((pi) => pi.userId === user.id);
    const activitiesTotal = userPlanItems.length;
    const activitiesNextQ = userPlanItems.filter(
      (pi) => pi.date >= now && pi.date <= qAhead
    ).length;

    // Activity type breakdown
    const activityTypes: Record<string, number> = {};
    for (const pi of userPlanItems) {
      activityTypes[pi.type] = (activityTypes[pi.type] ?? 0) + 1;
    }

    // Last seen: updated on login and every 5 min while the app is open
    const lastActive = user.lastSeenAt ?? null;

    // FY spread: are pitstops spread beyond Q1 (beyond June 2026)?
    const beyondQ1 = maxDate && maxDate > new Date("2026-06-30");

    // Readiness signal
    // "Not started" = truly no goals at all
    // "Partial" = has goals but missing pitstop dates, FY spread, or activities
    // "Ready" = goals + pitstop dates spanning beyond Q1 + activities in next 90 days
    let signal: "green" | "amber" | "red";
    if (userGoals.length === 0) {
      signal = "red";
    } else if (beyondQ1 && activitiesNextQ > 0 && pitstopsWithDate.length > 0) {
      signal = "green";
    } else {
      signal = "amber";
    }

    return {
      user,
      goalCount: userGoals.length,
      goalsByStatus: {
        Active:   userGoals.filter((g) => g.status === "Active").length,
        Paused:   userGoals.filter((g) => g.status === "Paused").length,
        Complete: userGoals.filter((g) => g.status === "Complete").length,
      },
      pitstopTotal: allPitstops.length,
      pitstopsWithDate: pitstopsWithDate.length,
      fyPitstops: fyPitstops.length,
      pitstopsWithChecklist: pitstopsWithChecklist.length,
      minDate,
      maxDate,
      activitiesTotal,
      activitiesNextQ,
      activityTypes,
      lastActive,
      signal,
    };
  });

  return (
    <ReadinessDashboard
      readiness={JSON.parse(JSON.stringify(readiness))}
      fyStart={FY_START.toISOString()}
      fyEnd={FY_END.toISOString()}
      generatedAt={now.toISOString()}
    />
  );
}
