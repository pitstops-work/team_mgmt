import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, CalendarRange } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { loadOperationsHome } from "@/lib/operations/home";
import { loadTodayDriver } from "@/lib/operations/today";
import { resolveViewContext } from "@/lib/operations/viewAs";
import { OnTheGroundToday } from "./_shared/OnTheGroundToday";
import { PreviewBanner } from "./_shared/PreviewBanner";

export const dynamic = "force-dynamic";

/**
 * Operations world home — the person's theme portals.
 *
 * One tile per theme (Creche, Youth, Welfare, RO Water…) the person owns goals
 * in, with a lifecycle count (setting-up / live). Tapping a tile opens the
 * phase-aware portal for that theme. The on-the-ground "do this today" driver
 * mounts above the tiles (Phase 2).
 */
export default async function OperationsHomePage({
  searchParams,
}: {
  searchParams: Promise<{ asUser?: string }>;
}) {
  const { asUser } = await searchParams;
  const ctx = await resolveViewContext(asUser);
  if (!ctx) redirect("/login");
  const userId = ctx.userId;
  const preview = ctx.viewingAs;
  const themeQuery = preview ? `?asUser=${encodeURIComponent(userId)}` : "";

  const [tiles, driver] = await Promise.all([
    loadOperationsHome([userId]),
    loadTodayDriver([userId]),
  ]);
  const domainLabels: Record<string, string> = {};
  for (const t of tiles) domainLabels[t.theme.key] = t.theme.label;

  return (
    <SurfaceProvider id="operations.today">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-6 space-y-8">
        {preview && <PreviewBanner name={preview.name} exitHref="/operations" />}
        <header>
          <h1 className="text-lg font-semibold text-stone-900">Operations</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {preview ? `${preview.name ?? "User"}'s centres, by theme.` : "Your centres, by theme."}
          </p>
        </header>

        <OnTheGroundToday
          userId={userId}
          overdue={driver.overdue}
          today={driver.today}
          checklists={driver.checklists}
          domainLabels={domainLabels}
          readOnly={!!preview}
        />

        {!preview && (
          <Link
            href="/operations/plan"
            className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 hover:bg-sky-100 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <CalendarRange className="w-4 h-4 text-sky-600" />
              <span className="text-sm font-medium text-sky-800">Plan next month&apos;s visits</span>
            </div>
            <ChevronRight className="w-4 h-4 text-sky-400" />
          </Link>
        )}

        <section>
          <h2 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-3">
            My themes
          </h2>
          {tiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-400">
              No centres assigned yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tiles.map((t) => (
                <Link
                  key={t.theme.key}
                  href={`/operations/${encodeURIComponent(t.theme.key)}${themeQuery}`}
                  className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 hover:border-stone-300 hover:shadow-sm transition-all"
                >
                  <span
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                    style={{ backgroundColor: t.theme.color }}
                  >
                    {t.theme.label.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">{t.theme.label}</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {t.settingUp > 0 && <span className="text-amber-600 font-medium">{t.settingUp} setting up</span>}
                      {t.settingUp > 0 && t.live > 0 && <span className="text-stone-300"> · </span>}
                      {t.live > 0 && <span className="text-emerald-600 font-medium">{t.live} live</span>}
                      {t.settingUp === 0 && t.live === 0 && <span>{t.total} centre{t.total === 1 ? "" : "s"}</span>}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-400" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </SurfaceProvider>
  );
}
