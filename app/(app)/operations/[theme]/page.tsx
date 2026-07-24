import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MapPin } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { loadThemeCatalog, indexThemes, type ThemeDef } from "@/lib/operations/themes";
import { loadCentresForTheme, type CentreRow } from "@/lib/operations/centres";

export const dynamic = "force-dynamic";

/**
 * Phase-aware thematic portal. Lists the person's centres in this theme,
 * grouped SETTING UP (current phase + step) vs LIVE (this-month visit status).
 */
export default async function OperationsThemePage({
  params,
}: {
  params: Promise<{ theme: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { theme: themeParam } = await params;
  const key = decodeURIComponent(themeParam);

  const catalog = await loadThemeCatalog();
  const theme: ThemeDef | undefined = indexThemes(catalog).get(key);
  // Unknown domain (not in catalog) → treat as a non-facility theme so custom
  // domains still resolve rather than 404.
  const resolved: ThemeDef =
    theme ?? { key, label: key, color: "#6b7280", layerKey: null, isFacility: false, sortOrder: 999 };

  const centres = await loadCentresForTheme([userId], resolved);
  if (centres.length === 0 && !theme) notFound();

  const settingUp = centres.filter((c) => c.phase.lifecycle === "setting_up");
  const live = centres.filter((c) => c.phase.lifecycle === "live");
  const done = centres.filter((c) => c.phase.lifecycle === "done");

  return (
    <SurfaceProvider id="operations.theme_portal">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-6 space-y-6">
        <div>
          <Link href="/operations" className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
            <ChevronLeft className="w-3.5 h-3.5" /> Operations
          </Link>
          <h1 className="text-lg font-semibold text-stone-900 mt-1 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: resolved.color }} />
            {resolved.label}
          </h1>
        </div>

        {settingUp.length > 0 && (
          <CentreGroup title="Setting up" count={settingUp.length}>
            {settingUp.map((c) => (
              <SettingUpRow key={c.goalId} centre={c} color={resolved.color} />
            ))}
          </CentreGroup>
        )}

        {live.length > 0 && (
          <CentreGroup title="Live · monthly review" count={live.length}>
            {live.map((c) => (
              <LiveRow key={c.goalId} centre={c} color={resolved.color} />
            ))}
          </CentreGroup>
        )}

        {done.length > 0 && (
          <CentreGroup title="Done" count={done.length}>
            {done.map((c) => (
              <LiveRow key={c.goalId} centre={c} color="#d6d3d1" />
            ))}
          </CentreGroup>
        )}

        {centres.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-400">
            No centres in this theme yet.
          </div>
        )}
      </div>
    </SurfaceProvider>
  );
}

function CentreGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">{title}</h2>
        <span className="text-[10px] text-stone-400">{count}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function CentreLocation({ centre }: { centre: CentreRow }) {
  const loc = centre.cluster?.name ?? centre.settlement?.name;
  if (!loc) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-stone-400">
      <MapPin className="w-3 h-3" /> {loc}
    </span>
  );
}

function SettingUpRow({ centre, color }: { centre: CentreRow; color: string }) {
  const { currentPhaseLabel, currentStep, totalSteps } = centre.phase;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate">{centre.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <CentreLocation centre={centre} />
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-medium text-amber-700">{currentPhaseLabel ?? "In setup"}</p>
        {currentStep != null && totalSteps != null && (
          <p className="text-[11px] text-stone-400 tabular-nums">
            {currentStep}/{totalSteps}
          </p>
        )}
      </div>
    </div>
  );
}

function LiveRow({ centre, color }: { centre: CentreRow; color: string }) {
  const { done, total } = centre.month;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate">{centre.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <CentreLocation centre={centre} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Dots done={done} total={total} />
        <span className="text-[11px] text-stone-400 tabular-nums">
          {total > 0 ? `${done}/${total}` : "—"}
        </span>
      </div>
    </div>
  );
}

function Dots({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const shown = Math.min(total, 6);
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < done ? "bg-emerald-500" : "bg-stone-200"}`}
        />
      ))}
    </span>
  );
}
