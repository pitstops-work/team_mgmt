import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiSteward } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Handshake, Plus, ArrowLeft, CheckCircle2 } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PartnerReviewsListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [meetings, steward] = await Promise.all([
    prisma.wikiPartnerReviewMeeting.findMany({
      where: { archivedAt: null },
      orderBy: { scheduledFor: "desc" },
      take: 200,
      select: {
        id: true,
        scheduledFor: true,
        completedAt: true,
        practiceChangesNoted: true,
        partnerOrg: { select: { id: true, name: true } },
        _count: { select: { attendees: true, linkedPages: true } },
      },
    }),
    isWikiSteward(userId),
  ]);

  return (
    <SurfaceProvider id="wiki.partner_reviews">
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/wiki" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          All pages
        </Link>

        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 inline-flex items-center gap-2">
            <Handshake className="w-5 h-5 text-stone-600" />
            Partner reviews
          </h1>
          {steward && (
            <Link
              href="/wiki/partner-reviews/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800"
            >
              <Plus className="w-4 h-4" />
              Schedule
            </Link>
          )}
        </header>

        {meetings.length === 0 ? (
          <p className="text-sm text-stone-500 text-center py-12">No partner reviews yet.</p>
        ) : (
          <ul className="space-y-2">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/wiki/partner-reviews/${m.id}`}
                  className="block bg-white border border-stone-200 rounded-lg px-4 py-3 hover:border-stone-400 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-stone-900 font-medium">
                          {m.partnerOrg.name}
                        </span>
                        {m.completedAt ? (
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Scheduled</span>
                        )}
                        <span className="text-xs text-stone-500">· {fmtDate(m.scheduledFor)}</span>
                      </div>
                      {m.practiceChangesNoted && (
                        <p className="text-sm text-stone-700 mt-1 truncate">{m.practiceChangesNoted}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-stone-500 shrink-0">
                      {m._count.attendees} attendees · {m._count.linkedPages} pages
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
