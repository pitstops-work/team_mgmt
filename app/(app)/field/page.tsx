import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MapPin, Database } from "lucide-react";
import { requireFieldAdmin, getRpDomainScope, activeFieldDomains } from "@/lib/field/access";
import { resolveFieldView, fieldHref } from "@/lib/field/viewAs";
import { loadViewAsCandidates } from "@/lib/operations/viewAs";
import { loadClusterSummaries } from "@/lib/field/queries";
import { PreviewBanner } from "../operations/_shared/PreviewBanner";
import { ViewAsPicker } from "../operations/_shared/ViewAsPicker";

export const dynamic = "force-dynamic";

// Screen 1 — the RP's clusters. Tap one to see what's there (live + setting up).
export default async function FieldHomePage({
  searchParams,
}: {
  searchParams: Promise<{ asUser?: string }>;
}) {
  const { asUser } = await searchParams;
  const view = await resolveFieldView(asUser);
  if (!view) redirect("/operations");
  const preview = view.viewingAs;

  const [clusters, isAdmin, candidates, rpDomains, domainCfg] = await Promise.all([
    // Assigned-but-empty clusters are listed too. They were hidden as noise,
    // but an RP whose patch has just been re-cut cannot otherwise tell an
    // assignment that never landed from one that landed on empty ground — and
    // neither could anyone checking the assignment for them. They sort last so
    // the clusters holding work still come first.
    loadClusterSummaries(view.userId, { includeEmpty: true }),
    requireFieldAdmin(),
    view.isAdmin && !preview ? loadViewAsCandidates() : Promise.resolve([]),
    getRpDomainScope(view.userId),
    activeFieldDomains(),
  ]);

  // Name the reason a cluster reads empty. Usually it is the domain scope —
  // "no creche work here yet" is a different fact from "nothing here yet", and
  // the one the reader needs.
  const scopeLabel = rpDomains
    ?.map((d) => domainCfg.get(d)?.label ?? d)
    .join(" / ");
  const emptyNote = scopeLabel ? `No ${scopeLabel} work here yet` : "Nothing here yet";

  const ordered = [...clusters].sort(
    (a, b) =>
      Number(a.live + a.settingUp === 0) - Number(b.live + b.settingUp === 0) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
      {preview && <PreviewBanner name={preview.name} exitHref="/field" />}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">
            {preview ? `${preview.name ?? "User"}'s clusters` : "Your clusters"}
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {preview
              ? `Exactly what ${preview.designation ?? "they"} sees here — read-only.`
              : "Pick a cluster to see what needs doing."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {view.isAdmin && !preview && candidates.length > 0 && (
            <ViewAsPicker candidates={candidates} basePath="/field" />
          )}
          {isAdmin && !preview && (
            <Link href="/field/backend" className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50">
              <Database size={13} /> Backend
            </Link>
          )}
        </div>
      </header>

      {clusters.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          No clusters assigned yet.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {ordered.map((c) => {
            const empty = c.live + c.settingUp === 0;
            return (
              <li key={c.id}>
                <Link
                  href={fieldHref(`/field/${c.id}`, view)}
                  className={`group flex items-center gap-3 rounded-xl border p-4 transition hover:shadow-sm ${
                    empty ? "border-stone-100 bg-stone-50 hover:border-stone-200" : "border-stone-200 bg-white hover:border-stone-300"
                  }`}
                >
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${empty ? "bg-stone-100 text-stone-300" : "bg-stone-100 text-stone-500"}`}>
                    <MapPin size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${empty ? "text-stone-500" : "text-stone-900"}`}>{c.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
                      {empty ? (
                        <span className="text-stone-400">{emptyNote}</span>
                      ) : (
                        <>
                          {c.live > 0 && <span>{c.live} live</span>}
                          {c.settingUp > 0 && <span>{c.settingUp} setting up</span>}
                          {c.attention > 0 && (
                            <span className="font-medium text-amber-700">{c.attention} need attention</span>
                          )}
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight size={18} className="flex-shrink-0 text-stone-300 group-hover:text-stone-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
