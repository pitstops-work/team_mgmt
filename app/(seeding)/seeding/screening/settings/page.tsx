import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { DEFAULT_DIMENSIONS, DEFAULT_KEY, screeningSettings, type Dimension } from "@/lib/seeding/screening/rubric";
import ScreeningNav from "../_components/ScreeningNav";
import { pageAccess } from "../_lib/load";
import RubricEditor from "./RubricEditor";
import SettingsForm from "./SettingsForm";
import ScopeEditor from "./ScopeEditor";

export const dynamic = "force-dynamic";

export default async function ScreeningSettingsPage({ searchParams }: { searchParams: Promise<{ rubric?: string }> }) {
  const s = await pageAccess();
  if (!s?.canConfigure) redirect("/seeding/screening");
  const sp = await searchParams;

  const [geos, rubrics, settings, members, scopes, recent] = await Promise.all([
    prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.screeningRubric.findMany(),
    screeningSettings(),
    prisma.seedingMember.findMany({
      where: { role: { in: ["coordinator", "geo_poc"] }, geoId: { not: null } },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.screeningScope.findMany(),
    prisma.screeningEvent.findMany({
      where: { type: { in: ["rubric_changed", "rubric_removed", "settings_changed", "scope_changed"] } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const tabs = [{ key: DEFAULT_KEY, label: "Default" }, ...geos.map((g) => ({ key: g.key, label: g.label }))];
  const active = tabs.find((t) => t.key === sp.rubric) ?? tabs[0];
  const own = rubrics.find((r) => r.key === active.key);
  const fallback = rubrics.find((r) => r.key === DEFAULT_KEY);
  const dims = ((own ?? fallback)?.dimensions as Dimension[] | undefined) ?? DEFAULT_DIMENSIONS;

  const reviewers = members
    .map((m) => ({
      userId: m.userId,
      name: m.user.name ?? m.user.email ?? "Unnamed",
      geoId: m.geoId!,
      geoLabel: geos.find((g) => g.id === m.geoId)?.label ?? "",
      districts: scopes.find((x) => x.userId === m.userId && x.geoId === m.geoId)?.districts ?? [],
    }))
    .filter((r, i, arr) => arr.findIndex((x) => x.userId === r.userId && x.geoId === r.geoId) === i);

  const intakeReady = !!process.env.SCREENING_INTAKE_TOKEN;

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Screening settings</h1>
      <p className="text-sm text-stone-500 mb-4">
        The rubric, the score bands and who screens where. Changes apply to reviews made from now on; recorded reviews keep
        the rubric they were scored against.
      </p>
      <ScreeningNav active="settings" canImport canConfigure />

      <section className="mb-8">
        <h2 className="text-base font-semibold text-stone-900 mb-1">Rubric</h2>
        <p className="text-sm text-stone-500 mb-3">
          Each dimension is scored 1–5 and is one axis of the profile chart. A geography can have its own rubric; otherwise
          it uses the default.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tabs.map((t) => {
            const has = rubrics.some((r) => r.key === t.key);
            return (
              <a
                key={t.key}
                href={`/seeding/screening/settings?rubric=${t.key}`}
                className={`rounded-full px-3 py-1 text-xs ${
                  t.key === active.key ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600 hover:border-stone-300"
                }`}
              >
                {t.label}
                {t.key !== DEFAULT_KEY && !has ? " (default)" : ""}
              </a>
            );
          })}
        </div>
        <RubricEditor
          key={active.key}
          rubricKey={active.key}
          label={active.label}
          initial={dims}
          guidance={own?.guidance ?? (active.key === DEFAULT_KEY ? fallback?.guidance ?? "" : "")}
          version={own?.version ?? null}
          inherited={active.key !== DEFAULT_KEY && !own}
        />
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-stone-900 mb-1">Bands and limits</h2>
        <SettingsForm initial={settings} />
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-stone-900 mb-1">Screener districts</h2>
        <p className="text-sm text-stone-500 mb-3">
          A coordinator or geo POC sees their whole geography unless districts are listed here. Geography leads always see
          all of theirs. Add people to a geography under Members.
        </p>
        <ScopeEditor reviewers={reviewers} />
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-stone-900 mb-1">Application portal intake</h2>
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 space-y-1">
          <p>
            Endpoint: <code className="text-xs bg-stone-100 px-1 rounded">POST /api/seeding/screening/intake</code>
          </p>
          <p>
            Token:{" "}
            {intakeReady ? (
              <span className="text-emerald-700">set</span>
            ) : (
              <span className="text-amber-700">not set — add SCREENING_INTAKE_TOKEN to the environment before the portal connects</span>
            )}
          </p>
          <p className="text-[11px] text-stone-500">The payload is described in docs/screening-intake.md.</p>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-stone-900 mb-1">Recent changes</h2>
        <ul className="text-[11px] text-stone-500 space-y-0.5">
          {recent.map((e) => (
            <li key={e.id}>
              {e.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {e.actor?.name ?? "System"} ·{" "}
              {e.type.replace(/_/g, " ")}
              {e.detail && typeof e.detail === "object" && "key" in e.detail ? ` (${String(e.detail.key)})` : ""}
            </li>
          ))}
          {recent.length === 0 && <li>None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
