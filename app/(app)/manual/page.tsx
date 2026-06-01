import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowLeft, Lock, Sprout, Layers, ArrowRight, Plus } from "lucide-react";
import { isWikiSteward } from "@/lib/wiki/auth";
import {
  MANUAL_TYPE,
  MATURITY_VALUES,
  MATURITY_LABEL,
  MATURITY_BADGE_CLS,
  isValidMaturity,
  type Maturity,
} from "@/lib/wiki/manual";

type SearchParams = Promise<{ maturity?: string }>;

function fmtDate(iso: Date | string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ManualListPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) notFound();

  const { maturity: maturityParam } = await searchParams;
  const maturityFilter: Maturity | null = isValidMaturity(maturityParam ?? null)
    ? (maturityParam as Maturity)
    : null;

  const steward = await isWikiSteward(userId);

  const manuals = await prisma.wikiPage.findMany({
    where: {
      type: MANUAL_TYPE,
      archivedAt: null,
      status: { not: "retired" },
      ...(maturityFilter ? { maturity: maturityFilter } : {}),
    },
    orderBy: [{ maturity: "desc" }, { lastEditedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      maturity: true,
      isSensitive: true,
      lastEditedAt: true,
      owner: { select: { id: true, name: true, image: true } },
      _count: {
        select: {
          manualSections: true,
          practiceEntries: { where: { archivedAt: null } },
          boundariesFrom: true,
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link
          href="/wiki"
          className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Wiki
        </Link>

        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-stone-700" />
            <h1 className="text-2xl font-semibold text-stone-900">Response Manual</h1>
          </div>
          {steward && (
            <Link
              href="/manual/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800"
            >
              <Plus className="w-4 h-4" />
              New module
            </Link>
          )}
        </header>

        <p className="text-sm text-stone-600 mb-6 max-w-2xl">
          A growing library of response modules — one per response. Each module is built on
          the shared eight-section template and grows by accretion from practice circles, partner
          reviews, and shadow visits.
        </p>

        {/* Maturity filter pills */}
        <nav className="flex flex-wrap items-center gap-2 mb-6 text-sm">
          <FilterPill href="/manual" label="All" active={!maturityFilter} />
          {MATURITY_VALUES.map((m) => (
            <FilterPill
              key={m}
              href={`/manual?maturity=${m}`}
              label={MATURITY_LABEL[m]}
              active={maturityFilter === m}
              maturity={m}
            />
          ))}
        </nav>

        {manuals.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-6 text-center text-sm text-stone-500">
            No modules match this filter.
          </div>
        ) : (
          <ul className="space-y-3">
            {manuals.map((m) => {
              const maturity = isValidMaturity(m.maturity) ? m.maturity : null;
              return (
                <li key={m.id}>
                  <Link
                    href={`/manual/${m.slug}`}
                    className="block bg-white border border-stone-200 rounded-lg p-4 hover:border-stone-400 transition"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <h2 className="text-lg font-medium text-stone-900">{m.title}</h2>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.isSensitive && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-800 text-[10px] uppercase"
                            title="Sensitive — restricted handling"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            Sensitive
                          </span>
                        )}
                        {maturity && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${MATURITY_BADGE_CLS[maturity]}`}
                          >
                            <Sprout className="w-3 h-3" />
                            {MATURITY_LABEL[maturity]}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-stone-500">
                      {m.owner && <span>Owner: <span className="text-stone-700">{m.owner.name ?? "—"}</span></span>}
                      <span>Edited {fmtDate(m.lastEditedAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {m._count.manualSections}/8 sections
                      </span>
                      <span>{m._count.practiceEntries} practice notes</span>
                      {m._count.boundariesFrom > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />
                          {m._count.boundariesFrom} boundary
                          {m._count.boundariesFrom === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function FilterPill({
  href,
  label,
  active,
  maturity,
}: {
  href: string;
  label: string;
  active: boolean;
  maturity?: Maturity;
}) {
  const cls = active
    ? maturity
      ? MATURITY_BADGE_CLS[maturity]
      : "bg-stone-900 text-white border-stone-900"
    : "bg-white border-stone-300 text-stone-600 hover:border-stone-400";
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs ${cls}`}
    >
      {label}
    </Link>
  );
}
