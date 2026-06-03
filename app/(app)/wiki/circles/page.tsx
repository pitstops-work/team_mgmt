import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiSteward } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Plus, ArrowLeft, CheckCircle2 } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function CirclesListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [circles, steward, needsDomains] = await Promise.all([
    prisma.wikiPracticeCircle.findMany({
      where: { archivedAt: null },
      orderBy: { scheduledFor: "desc" },
      take: 200,
      select: {
        id: true,
        scheduledFor: true,
        completedAt: true,
        vertical: true,
        caseDiscussed: true,
        facilitator: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true } },
        _count: { select: { attendees: true, linkedPages: true } },
      },
    }),
    isWikiSteward(userId),
    prisma.needsFormulaConfig.findMany({
      select: { domain: true, label: true },
    }),
  ]);
  // Resolve the stored camelCase domain key to its current label.
  // Falls back to the raw value for older free-text rows (pre-dropdown).
  const verticalLabel = new Map(needsDomains.map((d) => [d.domain, d.label]));

  return (
    <SurfaceProvider id="wiki.circles">
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/wiki" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          All pages
        </Link>

        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 inline-flex items-center gap-2">
            <Users className="w-5 h-5 text-stone-600" />
            Practice circles
          </h1>
          {steward && (
            <Link
              href="/wiki/circles/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800"
            >
              <Plus className="w-4 h-4" />
              Schedule
            </Link>
          )}
        </header>

        {circles.length === 0 ? (
          <p className="text-sm text-stone-500 text-center py-12">No circles yet.</p>
        ) : (
          <ul className="space-y-2">
            {circles.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/wiki/circles/${c.id}`}
                  className="block bg-white border border-stone-200 rounded-lg px-4 py-3 hover:border-stone-400 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-stone-900 font-medium">
                          {fmtDate(c.scheduledFor)}
                        </span>
                        {c.completedAt ? (
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Scheduled</span>
                        )}
                        {c.zone && <span className="text-xs text-stone-500">{c.zone.name}</span>}
                        {c.vertical && <span className="text-xs text-stone-500">· {verticalLabel.get(c.vertical) ?? c.vertical}</span>}
                      </div>
                      {c.caseDiscussed && (
                        <p className="text-sm text-stone-700 mt-1 truncate">{c.caseDiscussed}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-stone-500 shrink-0">
                      <div>{c.facilitator.name}</div>
                      <div>{c._count.attendees} attendees · {c._count.linkedPages} pages</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
    </SurfaceProvider>
  );
}
