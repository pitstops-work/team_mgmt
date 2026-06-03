import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward, isWikiCurator } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, LayoutDashboard } from "lucide-react";
import OwnerDashboard from "./OwnerDashboard";
import StewardDashboard from "./StewardDashboard";
import CuratorDashboard from "./CuratorDashboard";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function WikiDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [steward, curator, ownedCount] = await Promise.all([
    isWikiSteward(userId),
    isWikiCurator(userId),
    prisma.wikiPage.count({
      where: { ownerId: userId, archivedAt: null, status: { not: "retired" } },
    }),
  ]);

  const isOwner = ownedCount > 0;
  if (!isOwner && !steward && !curator) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-600 text-sm text-center max-w-md px-4">
          The dashboard shows pages you own and curate. You don't own any pages
          and aren't a wiki steward or curator yet.{" "}
          <Link href="/wiki" className="underline">Browse the wiki</Link>.
        </div>
      </main>
    );
  }

  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * DAY_MS);
  const dormantCutoff = new Date(now.getTime() - 60 * DAY_MS);

  // ── Owner data ─────────────────────────────────────────────────────
  const ownedPages = isOwner
    ? await prisma.wikiPage.findMany({
        where: { ownerId: userId, archivedAt: null, status: { not: "retired" } },
        orderBy: { nextReviewDue: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          type: true,
          status: true,
          lastEditedAt: true,
          nextReviewDue: true,
          ownerTermEnd: true,
          _count: {
            select: {
              flags: { where: { status: { not: "resolved" } } },
              comments: { where: { resolvedAt: null } },
            },
          },
        },
      })
    : [];

  // ── Steward data ────────────────────────────────────────────────────
  const stewardData = steward
    ? await fetchStewardData(now, in30d)
    : null;

  // ── Curator data ────────────────────────────────────────────────────
  const curatorData = curator
    ? await fetchCuratorData(dormantCutoff)
    : null;

  return (
    <SurfaceProvider id="wiki.dashboard">
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link
          href="/wiki"
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Wiki
        </Link>

        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 inline-flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-stone-600" />
            Dashboard
          </h1>
          <div className="text-xs text-stone-500 flex flex-wrap gap-2">
            {isOwner && (
              <span className="bg-white border border-stone-200 rounded px-2 py-0.5">
                Owner ({ownedCount})
              </span>
            )}
            {steward && (
              <span className="bg-white border border-stone-200 rounded px-2 py-0.5">Steward</span>
            )}
            {curator && (
              <span className="bg-white border border-stone-200 rounded px-2 py-0.5">Curator</span>
            )}
          </div>
        </header>

        <div className="space-y-8">
          {isOwner && (
            <OwnerDashboard
              pages={JSON.parse(JSON.stringify(ownedPages))}
            />
          )}
          {steward && stewardData && (
            <StewardDashboard data={JSON.parse(JSON.stringify(stewardData))} />
          )}
          {curator && curatorData && (
            <CuratorDashboard data={JSON.parse(JSON.stringify(curatorData))} />
          )}
        </div>

        {!isOwner && !steward && !curator && (
          <div className="text-center py-12">
            <BookOpen className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-500">Nothing to manage right now.</p>
          </div>
        )}
      </div>
    </main>
    </SurfaceProvider>
  );
}

async function fetchStewardData(now: Date, in30d: Date) {
  const [orphaned, overdue, termExpiring, underReview, recentFlags, pendingHandovers] =
    await Promise.all([
      prisma.wikiPage.findMany({
        where: { archivedAt: null, status: "orphaned" },
        orderBy: { lastEditedAt: "desc" },
        select: {
          id: true,
          slug: true,
          title: true,
          type: true,
          lastEditedAt: true,
        },
      }),
      prisma.wikiPage.findMany({
        where: {
          archivedAt: null,
          status: { not: "retired" },
          nextReviewDue: { lt: now },
        },
        orderBy: { nextReviewDue: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          nextReviewDue: true,
          owner: { select: { id: true, name: true } },
        },
        take: 50,
      }),
      prisma.wikiPage.findMany({
        where: {
          archivedAt: null,
          status: { not: "retired" },
          ownerId: { not: null },
          ownerTermEnd: { gte: now, lte: in30d },
        },
        orderBy: { ownerTermEnd: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          ownerTermEnd: true,
          owner: { select: { id: true, name: true } },
        },
      }),
      prisma.wikiPage.findMany({
        where: { archivedAt: null, status: "under_review" },
        orderBy: { lastEditedAt: "desc" },
        select: {
          id: true,
          slug: true,
          title: true,
          owner: { select: { id: true, name: true } },
        },
      }),
      prisma.wikiFlag.findMany({
        where: { status: { not: "resolved" } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          reason: true,
          createdAt: true,
          flagger: { select: { name: true } },
          page: { select: { slug: true, title: true } },
        },
      }),
      prisma.wikiOwnerHandover.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          handoverNote: true,
          createdAt: true,
          page: { select: { slug: true, title: true } },
          fromUser: { select: { name: true } },
          toUser: { select: { name: true } },
        },
      }),
    ]);

  return {
    orphaned,
    overdue,
    termExpiring,
    underReview,
    recentFlags,
    pendingHandovers,
  };
}

async function fetchCuratorData(dormantCutoff: Date) {
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;
  const last30 = new Date(now.getTime() - 30 * DAY);
  const last6mo = new Date(now.getTime() - 180 * DAY);

  const [
    tagFreq,
    mostFlagged,
    dormant,
    orphanCount,
    totalCount,
    byType,
    viewsLast30d,
    mostViewedRows,
    zeroViewPages,
    // ── Practice circle health ────────────────────────────────────────
    circlesLast30d,
    circlesLast6mo,
    circlesWithEditsLast30d,
    facilitatorsLast6mo,
    // ── Gap queue health ──────────────────────────────────────────────
    openGapCount,
    oldestOpenGap,
    publishedGapsLast90d,
    declinedGapsLast90d,
    // ── Flag SLA ──────────────────────────────────────────────────────
    staleFlags,
    // ── Observation activity ──────────────────────────────────────────
    observationsLast30d,
  ] = await Promise.all([
    prisma.wikiPageTag.groupBy({
      by: ["tagType", "tagValue"],
      _count: { _all: true },
      orderBy: { _count: { tagValue: "desc" } },
      take: 30,
    }),
    prisma.wikiPage.findMany({
      where: {
        archivedAt: null,
        status: { not: "retired" },
        flags: { some: { status: { not: "resolved" } } },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        _count: {
          select: { flags: { where: { status: { not: "resolved" } } } },
        },
      },
      take: 10,
    }),
    prisma.wikiPage.findMany({
      where: {
        archivedAt: null,
        status: { not: "retired" },
        lastEditedAt: { lt: dormantCutoff },
      },
      orderBy: { lastEditedAt: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        lastEditedAt: true,
        owner: { select: { name: true } },
      },
      take: 20,
    }),
    prisma.wikiPage.count({
      where: { archivedAt: null, status: "orphaned" },
    }),
    prisma.wikiPage.count({
      where: { archivedAt: null, status: { not: "retired" } },
    }),
    prisma.wikiPage.groupBy({
      by: ["type"],
      where: { archivedAt: null, status: { not: "retired" } },
      _count: { _all: true },
    }),
    prisma.wikiPageView.count({
      where: { createdAt: { gte: dormantCutoff } },
    }),
    prisma.wikiPageView.groupBy({
      by: ["pageId"],
      where: { createdAt: { gte: dormantCutoff } },
      _count: { _all: true },
      orderBy: { _count: { pageId: "desc" } },
      take: 10,
    }),
    // Pages live for ≥30 days with no views ever
    prisma.$queryRaw<{ id: string; slug: string; title: string; createdAt: Date }[]>`
      SELECT p.id, p.slug, p.title, p."createdAt"
      FROM "WikiPage" p
      LEFT JOIN "WikiPageView" v ON v."pageId" = p.id
      WHERE p."archivedAt" IS NULL
        AND p.status != 'retired'
        AND p."createdAt" < ${dormantCutoff}
        AND v.id IS NULL
      ORDER BY p."createdAt" ASC
      LIMIT 20
    `,
    // Circle health
    prisma.wikiPracticeCircle.count({
      where: { archivedAt: null, completedAt: { gte: last30 } },
    }),
    prisma.wikiPracticeCircle.count({
      where: { archivedAt: null, completedAt: { gte: last6mo } },
    }),
    prisma.wikiPracticeCircle.count({
      where: {
        archivedAt: null,
        completedAt: { gte: last30 },
        linkedPages: { some: {} },
      },
    }),
    prisma.wikiPracticeCircle.findMany({
      where: { archivedAt: null, completedAt: { gte: last6mo } },
      select: { facilitatorId: true },
      distinct: ["facilitatorId"],
    }),
    // Gap queue
    prisma.wikiPracticeGap.count({ where: { archivedAt: null, status: "open" } }),
    prisma.wikiPracticeGap.findFirst({
      where: { archivedAt: null, status: "open" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.wikiPracticeGap.findMany({
      where: { archivedAt: null, status: "published", resolvedAt: { gte: new Date(now.getTime() - 90 * DAY) } },
      select: { createdAt: true, resolvedAt: true },
    }),
    prisma.wikiPracticeGap.count({
      where: { archivedAt: null, status: "declined", resolvedAt: { gte: new Date(now.getTime() - 90 * DAY) } },
    }),
    // Flag SLA
    prisma.wikiFlag.count({
      where: {
        status: { not: "resolved" },
        createdAt: { lt: new Date(now.getTime() - 30 * DAY) },
      },
    }),
    // Observation activity
    prisma.wikiPracticeObservation.count({
      where: { archivedAt: null, happenedAt: { gte: last30 } },
    }),
  ]);

  // Resolve most-viewed page rows to title/slug
  const viewedIds = mostViewedRows.map((r) => r.pageId);
  const viewedDetails = viewedIds.length
    ? await prisma.wikiPage.findMany({
        where: { id: { in: viewedIds } },
        select: { id: true, slug: true, title: true },
      })
    : [];
  const viewedById = new Map(viewedDetails.map((p) => [p.id, p]));
  const mostViewed = mostViewedRows
    .map((r) => {
      const p = viewedById.get(r.pageId);
      return p ? { id: p.id, slug: p.slug, title: p.title, views: r._count._all } : null;
    })
    .filter(Boolean) as { id: string; slug: string; title: string; views: number }[];

  const flaggedSorted = mostFlagged
    .map((p) => ({ ...p, openFlagCount: p._count.flags }))
    .sort((a, b) => b.openFlagCount - a.openFlagCount)
    .slice(0, 10);

  // Gap-to-publish median in days, over the last 90 days of published gaps.
  const gapTtpDays = publishedGapsLast90d
    .filter((g) => g.resolvedAt)
    .map((g) => Math.round((g.resolvedAt!.getTime() - g.createdAt.getTime()) / DAY));
  gapTtpDays.sort((a, b) => a - b);
  const gapPublishMedianDays = gapTtpDays.length
    ? gapTtpDays[Math.floor(gapTtpDays.length / 2)]
    : null;

  const oldestOpenGapAgeDays = oldestOpenGap
    ? Math.round((now.getTime() - oldestOpenGap.createdAt.getTime()) / DAY)
    : null;

  return {
    tagFreq: tagFreq.map((t) => ({ tagType: t.tagType, tagValue: t.tagValue, count: t._count._all })),
    mostFlagged: flaggedSorted,
    dormant,
    orphanRate: totalCount > 0 ? Math.round((orphanCount / totalCount) * 100) : 0,
    orphanCount,
    totalCount,
    byType: byType.map((b) => ({ type: b.type, count: b._count._all })),
    viewsLast30d,
    mostViewed,
    zeroViewPages,
    circles: {
      last30d: circlesLast30d,
      last6mo: circlesLast6mo,
      withEditsLast30d: circlesWithEditsLast30d,
      uniqueFacilitatorsLast6mo: facilitatorsLast6mo.length,
    },
    gaps: {
      openCount: openGapCount,
      oldestOpenAgeDays: oldestOpenGapAgeDays,
      publishedLast90d: publishedGapsLast90d.length,
      declinedLast90d: declinedGapsLast90d,
      publishMedianDays: gapPublishMedianDays,
    },
    flagsBreaching30d: staleFlags,
    observationsLast30d,
  };
}
