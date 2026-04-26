import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import ThreadsList from "./ThreadsList";

export default async function ThreadsPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const userRole = (session as { user?: { role?: string } } | null)?.user?.role ?? "member";
  const isAdmin = isAdminUser(session);

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { designation: true, reportsToId: true },
  });
  const designation = me?.designation ?? "Other";

  // Scope thread visibility by role/designation
  let teamIds: string[] = [userId];
  if (designation === "ZL") {
    const reports = await prisma.user.findMany({
      where: { reportsToId: userId },
      select: { id: true },
    });
    teamIds = [userId, ...reports.map(r => r.id)];
  } else if (designation === "PM") {
    const directReports = await prisma.user.findMany({
      where: { reportsToId: userId },
      select: { id: true },
    });
    const directIds = directReports.map(r => r.id);
    const indirectReports = directIds.length > 0
      ? await prisma.user.findMany({
          where: { reportsToId: { in: directIds } },
          select: { id: true },
        })
      : [];
    teamIds = [userId, ...directIds, ...indirectReports.map(r => r.id)];
  }

  // Pre-fetch owned IDs for RP/ZL/PM so the filter uses simple IN clauses
  // (nested relation filters with OR can silently over-include in complex schemas)
  let ownedGoalIds: string[] = [];
  let ownedPitstopIds: string[] = [];
  if (!isAdmin && (designation === "RP" || designation === "ZL" || designation === "PM")) {
    const [gRows, pRows] = await Promise.all([
      prisma.goal.findMany({
        where: { deletedAt: null, ownerId: { in: teamIds } },
        select: { id: true },
      }),
      prisma.pitstop.findMany({
        where: { deletedAt: null, ownerId: { in: teamIds } },
        select: { id: true },
      }),
    ]);
    ownedGoalIds    = gRows.map(r => r.id);
    ownedPitstopIds = pRows.map(r => r.id);
  }

  // Build thread visibility filter (ownership-based)
  const ownershipWhere = isAdmin
    ? { deletedAt: null }
    : designation === "RP" || designation === "ZL" || designation === "PM"
    ? {
        deletedAt: null,
        OR: [
          ...(ownedPitstopIds.length > 0 ? [{ pitstopId: { in: ownedPitstopIds } }] : []),
          ...(ownedGoalIds.length    > 0 ? [{ goalId:    { in: ownedGoalIds    } }] : []),
          { subscriptions: { some: { userId } } },
        ],
      }
    : { deletedAt: null };

  // Validity filter: thread must be attached to a live pitstop/goal/event
  // (separate so it doesn't overwrite the OR in ownershipWhere)
  const validWhere = {
    OR: [
      { pitstop: { deletedAt: null, goal: { deletedAt: null } } },
      { goalId: { not: null } },
      { eventId: { not: null } },
    ],
  };

  const [threads, goals, users] = await Promise.all([
    prisma.thread.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { AND: [ownershipWhere, validWhere] } as any,
      select: {
        id: true,
        name: true,
        updatedAt: true,
        pitstopId: true,
        goalId: true,
        eventId: true,
        checklistItemId: true,
        pitstop: {
          select: {
            id: true, title: true,
            goal: { select: { id: true, title: true } },
            owner: { select: { id: true, name: true, image: true } },
          },
        },
        goal: {
          select: {
            id: true, title: true,
            owner: { select: { id: true, name: true, image: true } },
          },
        },
        event: {
          select: { id: true, title: true, scheduledAt: true },
        },
        checklistItem: {
          select: { id: true, text: true },
        },
        _count: { select: { messages: { where: { deletedAt: null } } } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, author: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // Goals scoped by role
    isAdmin
      ? prisma.goal.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } })
      : prisma.goal.findMany({
          where: { deletedAt: null, ownerId: { in: teamIds } },
          select: { id: true, title: true },
          orderBy: { title: "asc" },
        }),
    prisma.user.findMany({ select: { id: true, name: true, image: true } }),
  ]);

  // Fetch all pitstops for goals user can access (for thread creation wizard)
  const goalIds = goals.map(g => g.id);
  const pitstops = await prisma.pitstop.findMany({
    where: { deletedAt: null, goalId: { in: goalIds } },
    select: { id: true, title: true, goalId: true },
    orderBy: { order: "asc" },
  });

  // Fetch all checklist items for those pitstops
  const pitstopIds = pitstops.map(p => p.id);
  const checklistItemsRaw = await prisma.$queryRaw<{
    id: string; text: string; pitstopId: string; status: string;
  }[]>`
    SELECT id, text, "pitstopId", status::text
    FROM "ChecklistItem"
    WHERE "pitstopId" = ANY(${pitstopIds})
    ORDER BY "order" ASC
  `;

  // Fetch events for those pitstops (include checklistItemId for cascade)
  const events = pitstopIds.length > 0
    ? await prisma.$queryRaw<{ id: string; title: string; pitstopId: string; checklistItemId: string | null }[]>`
        SELECT DISTINCT pe.id, pe.title, pep."pitstopId", pe."checklistItemId"
        FROM "PitstopEvent" pe
        JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
        WHERE pep."pitstopId" = ANY(${pitstopIds})
          AND pe."deletedAt" IS NULL
        ORDER BY pe.title
      `
    : [];

  const langRows = await prisma.$queryRaw<{ preferredLang: string }[]>`
    SELECT "preferredLang" FROM "User" WHERE id = ${userId} LIMIT 1
  `;
  const preferredLang = langRows[0]?.preferredLang ?? "en";

  return (
    <ThreadsList
      threads={JSON.parse(JSON.stringify(threads))}
      goals={JSON.parse(JSON.stringify(goals))}
      pitstops={JSON.parse(JSON.stringify(pitstops))}
      checklistItems={JSON.parse(JSON.stringify(checklistItemsRaw))}
      events={JSON.parse(JSON.stringify(events))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={userId}
      currentUserName={session!.user!.name ?? session!.user!.email ?? ""}
      currentUserRole={userRole}
      preferredLang={preferredLang}
    />
  );
}
