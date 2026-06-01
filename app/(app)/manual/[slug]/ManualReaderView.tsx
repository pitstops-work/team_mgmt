"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import {
  ArrowLeft,
  BookOpen,
  ShieldAlert,
  ArrowRight,
  Sprout,
  Lock,
  Layers,
  Plus,
  Pencil,
} from "lucide-react";
import {
  SECTION_NUMBERS,
  SECTION_LABELS,
  SECTION_STABILITY,
  MATURITY_LABEL,
  MATURITY_BADGE_CLS,
  MATURITY_TRUST_COPY,
  BOUNDARY_KIND_LABEL,
  isValidMaturity,
  type SectionNumber,
  type BoundaryKind,
} from "@/lib/wiki/manual";

type BoundaryPage = {
  slug: string;
  title: string;
  maturity: string | null;
  type: string;
};

type Boundary = {
  id: string;
  kind: string;
  note: string | null;
  toPage?: BoundaryPage;
  fromPage?: BoundaryPage;
};

type Section = {
  sectionNumber: number;
  content: string;
  lastEditedAt: string;
};

type PracticeEntry = {
  id: string;
  sectionNumber: number;
  body: string;
  settlement: string | null;
  happenedAt: string;
  status: string;
  promotedToSectionNumber: number | null;
  observer: { id: string; name: string | null; image: string | null };
  partnerOrg: { id: string; name: string } | null;
};

type Page = {
  id: string;
  slug: string;
  title: string;
  type: string;
  maturity: string | null;
  isSensitive: boolean;
  sensitiveNote: string | null;
  canonicalContent: string;
  status: string;
  lastEditedAt: string;
  owner: { id: string; name: string | null; image: string | null } | null;
  lastEditor: { id: string; name: string | null } | null;
  manualSections: Section[];
  boundariesFrom: Boundary[];
  boundariesTo: Boundary[];
  practiceEntries: PracticeEntry[];
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STABILITY_CHIP: Record<string, { label: string; cls: string }> = {
  stable: { label: "Stable", cls: "bg-stone-100 text-stone-600 border-stone-200" },
  between: { label: "Between", cls: "bg-stone-50 text-stone-500 border-stone-200" },
  living: { label: "Living", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export default function ManualReaderView({ page, canEdit }: { page: Page; currentUserId: string; canEdit: boolean }) {
  const sectionsByNumber = new Map<number, Section>();
  page.manualSections.forEach((s) => sectionsByNumber.set(s.sectionNumber, s));

  const entriesBySection = new Map<number, PracticeEntry[]>();
  page.practiceEntries.forEach((e) => {
    const arr = entriesBySection.get(e.sectionNumber) ?? [];
    arr.push(e);
    entriesBySection.set(e.sectionNumber, arr);
  });

  const maturity = isValidMaturity(page.maturity) ? page.maturity : null;

  // Group outgoing boundaries by kind
  const outBoundariesByKind = new Map<string, Boundary[]>();
  page.boundariesFrom.forEach((b) => {
    const arr = outBoundariesByKind.get(b.kind) ?? [];
    arr.push(b);
    outBoundariesByKind.set(b.kind, arr);
  });

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link
          href="/manual"
          className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Manual
        </Link>

        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wide text-stone-500">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Response Module</span>
          </div>
          <h1 className="text-3xl font-semibold text-stone-900 mb-3">{page.title}</h1>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {maturity && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${MATURITY_BADGE_CLS[maturity]}`}
                title={MATURITY_TRUST_COPY[maturity]}
              >
                <Sprout className="w-3 h-3" />
                {MATURITY_LABEL[maturity]}
              </span>
            )}
            {page.owner && (
              <span className="text-xs text-stone-500">
                Owner: <span className="text-stone-700">{page.owner.name ?? "—"}</span>
              </span>
            )}
            <span className="text-xs text-stone-400">·</span>
            <span className="text-xs text-stone-500">
              Edited {fmtDate(page.lastEditedAt)}
            </span>
          </div>

          {maturity && (
            <p className="mt-2 text-xs text-stone-500 italic">
              {MATURITY_TRUST_COPY[maturity]}
            </p>
          )}
        </header>

        {/* Sensitive banner */}
        {page.isSensitive && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-lg p-3 flex gap-3">
            <Lock className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-rose-900">Sensitive — restricted handling</div>
              {page.sensitiveNote && (
                <p className="text-xs text-rose-800 mt-1">{page.sensitiveNote}</p>
              )}
            </div>
          </div>
        )}

        {/* Boundary pills */}
        {(page.boundariesFrom.length > 0 || page.boundariesTo.length > 0) && (
          <div className="mb-6 space-y-2 text-sm">
            {Array.from(outBoundariesByKind.entries()).map(([kind, edges]) => (
              <div key={kind} className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-medium ${
                    kind === "hands_off" ? "text-rose-700" : "text-sky-700"
                  }`}
                >
                  {BOUNDARY_KIND_LABEL[kind as BoundaryKind]}:
                </span>
                {edges.map((b) =>
                  b.toPage ? (
                    <Link
                      key={b.id}
                      href={`/manual/${b.toPage.slug}`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs hover:bg-stone-50 ${
                        kind === "hands_off"
                          ? "border-rose-200 text-rose-800 bg-rose-50"
                          : "border-sky-200 text-sky-800 bg-sky-50"
                      }`}
                      title={b.note ?? undefined}
                    >
                      <ArrowRight className="w-3 h-3" />
                      {b.toPage.title}
                    </Link>
                  ) : null,
                )}
              </div>
            ))}
            {page.boundariesTo.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-stone-500">Referenced by:</span>
                {page.boundariesTo.map((b) =>
                  b.fromPage ? (
                    <Link
                      key={b.id}
                      href={`/manual/${b.fromPage.slug}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-stone-200 bg-stone-50 text-stone-700 text-xs hover:bg-stone-100"
                      title={b.note ?? undefined}
                    >
                      {b.fromPage.title}
                    </Link>
                  ) : null,
                )}
              </div>
            )}
          </div>
        )}

        {/* Lede + capture CTA */}
        {page.canonicalContent && (
          <div className="mb-4 text-stone-700 leading-relaxed border-l-4 border-stone-300 pl-4 italic">
            {page.canonicalContent}
          </div>
        )}
        <div className="mb-8 flex items-center gap-2">
          <Link
            href={`/wiki/capture?manual=${page.slug}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700"
          >
            <Plus className="w-4 h-4" />
            Add what we learned
          </Link>
          {canEdit && (
            <Link
              href={`/manual/${page.slug}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 text-stone-700 text-sm rounded-md hover:bg-stone-100"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit module
            </Link>
          )}
        </div>

        {/* Body: TOC sidebar + sections */}
        <div className="flex gap-8">
          {/* Sticky TOC */}
          <aside className="hidden lg:block w-48 shrink-0">
            <div className="sticky top-6">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-stone-500 mb-3">
                <Layers className="w-3 h-3" />
                Contents
              </div>
              <ol className="space-y-1.5 text-sm">
                {SECTION_NUMBERS.map((n) => (
                  <li key={n}>
                    <a
                      href={`#section-${n}`}
                      className="text-stone-600 hover:text-stone-900 flex gap-1.5"
                    >
                      <span className="text-stone-400 tabular-nums">{n}.</span>
                      <span className="leading-tight">{SECTION_LABELS[n]}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          {/* Sections */}
          <article className="flex-1 min-w-0 space-y-10">
            {SECTION_NUMBERS.map((n) => {
              const section = sectionsByNumber.get(n);
              const entries = entriesBySection.get(n) ?? [];
              const stability = SECTION_STABILITY[n];
              return (
                <ManualSection
                  key={n}
                  slug={page.slug}
                  number={n}
                  content={section?.content ?? ""}
                  stability={stability}
                  entries={entries}
                />
              );
            })}
          </article>
        </div>
      </div>
    </main>
  );
}

function ManualSection({
  slug,
  number,
  content,
  stability,
  entries,
}: {
  slug: string;
  number: SectionNumber;
  content: string;
  stability: string;
  entries: PracticeEntry[];
}) {
  const chip = STABILITY_CHIP[stability] ?? STABILITY_CHIP.stable;
  const id = `section-${number}`;
  const showEntryZone = stability === "living" || entries.length > 0;
  return (
    <section id={id} className="scroll-mt-4">
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-2xl font-semibold text-stone-900">
          <span className="text-stone-400 tabular-nums mr-2">{number}.</span>
          {SECTION_LABELS[number]}
        </h2>
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide border ${chip.cls}`}>
          {chip.label}
        </span>
      </div>

      {content ? (
        <div className="prose prose-stone max-w-none prose-headings:font-semibold prose-table:text-sm prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-stone-400 italic">No content yet for this section.</p>
      )}

      {showEntryZone && (
        <div className="mt-4 bg-amber-50/60 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-amber-800">
              <ShieldAlert className="w-3 h-3" />
              Practice notes
            </div>
            <Link
              href={`/wiki/capture?manual=${slug}&section=${number}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 rounded"
            >
              <Plus className="w-3 h-3" />
              Add
            </Link>
          </div>
          {entries.length === 0 ? (
            <p className="text-xs text-amber-900/70 italic">
              No entries yet. Practice circles fill this.
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-stone-800 whitespace-pre-wrap">{e.body}</p>
                  <div className="mt-1 text-xs text-stone-500">
                    {e.observer.name ?? "—"}
                    {e.settlement ? ` · ${e.settlement}` : ""}
                    {e.partnerOrg ? ` · ${e.partnerOrg.name}` : ""}
                    {" · "}
                    {fmtDate(e.happenedAt)}
                    {e.status === "promoted" && e.promotedToSectionNumber != null && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] uppercase">
                        Promoted → §{e.promotedToSectionNumber}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
