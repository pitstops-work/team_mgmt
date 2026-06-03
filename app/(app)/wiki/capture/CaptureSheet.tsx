"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, X, Sprout, Lock, Inbox, CheckCircle2, Plus, BookOpen, FileText } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import {
  MANUAL_TYPE,
  SECTION_NUMBERS,
  SECTION_LABELS,
  SECTION_INTAKE_HINT,
  DEFAULT_CAPTURE_SECTION,
  MATURITY_LABEL,
  MATURITY_BADGE_CLS,
  isValidMaturity,
  type SectionNumber,
} from "@/lib/wiki/manual";

type Vertical = { domain: string; label: string };
type PageMatch = {
  id: string;
  slug: string;
  title: string;
  type: string;
  maturity: string | null;
  isSensitive: boolean;
};

type Target =
  | ({ kind: "manual"; sectionNumber: SectionNumber } & PageMatch)
  | ({ kind: "page" } & PageMatch)
  | { kind: "gap"; suggestedTitle: string };

type Saved = {
  kind: "manual" | "page" | "gap";
  destination: { url: string; label: string };
};

const BODY_PROMPTS = [
  "Where (settlement) and who",
  "What got stuck or what worked",
  "What you'd try differently",
];

export default function CaptureSheet({
  verticals,
  prefillTarget,
  prefillSectionNumber,
}: {
  verticals: Vertical[];
  prefillTarget: PageMatch | null;
  prefillSectionNumber: SectionNumber | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<Target | null>(() => {
    if (!prefillTarget) return null;
    if (prefillTarget.type === MANUAL_TYPE) {
      return {
        ...prefillTarget,
        kind: "manual",
        sectionNumber: (prefillSectionNumber ?? DEFAULT_CAPTURE_SECTION) as SectionNumber,
      };
    }
    return { ...prefillTarget, kind: "page" };
  });
  const [body, setBody] = useState("");
  const [vertical, setVertical] = useState("");
  const [city, setCity] = useState("");
  const [settlement, setSettlement] = useState("");
  const [happenedAt, setHappenedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Debounced picker search
  useEffect(() => {
    const q = query.trim();
    if (!q || target) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/wiki/capture/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, target]);

  function pickPage(p: PageMatch) {
    if (p.type === MANUAL_TYPE) {
      setTarget({ ...p, kind: "manual", sectionNumber: DEFAULT_CAPTURE_SECTION });
    } else {
      setTarget({ ...p, kind: "page" });
    }
    setResults([]);
    setTimeout(() => bodyRef.current?.focus(), 50);
  }

  function pickGap() {
    setTarget({ kind: "gap", suggestedTitle: query.trim() });
    setResults([]);
    setTimeout(() => bodyRef.current?.focus(), 50);
  }

  function clearTarget() {
    setTarget(null);
    setBody("");
    setVertical("");
    setCity("");
    setError(null);
  }

  function reset() {
    setSaved(null);
    setTarget(null);
    setQuery("");
    setResults([]);
    setBody("");
    setVertical("");
    setCity("");
    setSettlement("");
    setError(null);
  }

  async function submit() {
    if (!target || !body.trim()) return;
    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      body: body.trim(),
      attribution: {
        settlement: settlement.trim() || undefined,
        happenedAt: new Date(happenedAt + "T12:00:00").toISOString(),
      },
    };

    if (target.kind === "manual") {
      payload.target = { kind: "manual", pageId: target.id, sectionNumber: target.sectionNumber };
    } else if (target.kind === "page") {
      payload.target = { kind: "page", pageId: target.id };
    } else {
      payload.target = {
        kind: "gap",
        vertical: vertical.trim(),
        suggestedTitle: target.suggestedTitle || undefined,
        city: city.trim() || undefined,
      };
    }

    try {
      const res = await fetch("/api/wiki/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
      } else {
        setSaved({ kind: data.kind, destination: data.destination });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = useMemo(() => {
    if (!target || !body.trim() || submitting) return false;
    if (target.kind === "gap" && !vertical.trim()) return false;
    return true;
  }, [target, body, vertical, submitting]);

  return (
    <SurfaceProvider id="wiki.capture_sheet">
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link
          href="/wiki"
          className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Wiki
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 mb-1">Document what we learned</h1>
          <p className="text-sm text-stone-600">
            Capture what came up in a practice circle, partner review, or shadow visit.
            What you write here lands wherever it's most useful — no taxonomy to think about.
          </p>
        </header>

        {saved ? (
          <SuccessCard saved={saved} onAddAnother={reset} />
        ) : (
          <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-5">
            {/* Step 1: Picker */}
            <div>
              <label className="block text-sm font-medium text-stone-800 mb-1.5">
                What is this about?
              </label>
              {target ? (
                <TargetCard target={target} onClear={clearTarget} onSectionChange={(n) => {
                  if (target.kind === "manual") setTarget({ ...target, sectionNumber: n });
                }} />
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-stone-400 pointer-events-none" />
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search pages and modules…"
                    className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                  {searching && (
                    <span className="absolute right-3 top-3 text-xs text-stone-400">…</span>
                  )}
                  {query.trim() && (
                    <div className="mt-1 border border-stone-200 rounded-md bg-white overflow-hidden">
                      {results.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickPage(p)}
                          className="w-full text-left px-3 py-2 hover:bg-stone-50 border-b border-stone-100 last:border-b-0"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-stone-900 truncate">{p.title}</div>
                              <div className="text-xs text-stone-500">
                                {p.type === MANUAL_TYPE ? "care response" : "how we work"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {p.isSensitive && (
                                <span className="inline-flex items-center px-1 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700 text-[10px]">
                                  <Lock className="w-2.5 h-2.5" />
                                </span>
                              )}
                              {isValidMaturity(p.maturity) && (
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] ${MATURITY_BADGE_CLS[p.maturity]}`}>
                                  <Sprout className="w-2.5 h-2.5" />
                                  {MATURITY_LABEL[p.maturity]}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={pickGap}
                        className="w-full text-left px-3 py-2 hover:bg-amber-50 bg-amber-50/40 flex items-center gap-2 text-sm"
                      >
                        <Inbox className="w-4 h-4 text-amber-700" />
                        <span className="text-stone-700">
                          Nothing matches — <span className="text-amber-900 font-medium">file as a gap: "{query.trim()}"</span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Body — only after target picked */}
            {target && (
              <>
                <div>
                  <label className="block text-sm font-medium text-stone-800 mb-1.5">
                    {target.kind === "gap"
                      ? "What's the one-line need?"
                      : target.kind === "manual"
                      ? SECTION_INTAKE_HINT[(target as { sectionNumber: SectionNumber }).sectionNumber]
                      : "What did we learn?"}
                  </label>
                  <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={5}
                    placeholder={
                      target.kind === "gap"
                        ? "e.g. We don't have a protocol for inviting respected community members to the camp"
                        : BODY_PROMPTS.map((p) => "• " + p).join("\n")
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                </div>

                {/* Gap-specific: vertical + city */}
                {target.kind === "gap" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1">Vertical <span className="text-rose-600">*</span></label>
                      <select
                        value={vertical}
                        onChange={(e) => setVertical(e.target.value)}
                        className="w-full px-2 py-1.5 border border-stone-300 rounded text-sm bg-white"
                      >
                        <option value="">— pick one —</option>
                        {verticals.map((v) => (
                          <option key={v.domain} value={v.domain}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1">City (optional)</label>
                      <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-2 py-1.5 border border-stone-300 rounded text-sm bg-white"
                      >
                        <option value="">— any —</option>
                        <option value="bangalore">Bangalore</option>
                        <option value="chennai">Chennai</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Attribution — settlement + date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">Settlement (optional)</label>
                    <input
                      type="text"
                      value={settlement}
                      onChange={(e) => setSettlement(e.target.value)}
                      placeholder="e.g. Semmancherry"
                      className="w-full px-2 py-1.5 border border-stone-300 rounded text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">When</label>
                    <input
                      type="date"
                      value={happenedAt}
                      onChange={(e) => setHappenedAt(e.target.value)}
                      className="w-full px-2 py-1.5 border border-stone-300 rounded text-sm bg-white"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={clearTarget}
                    className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
                  >
                    Start over
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canSubmit}
                    className="px-4 py-1.5 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
    </SurfaceProvider>
  );
}

function TargetCard({
  target,
  onClear,
  onSectionChange,
}: {
  target: Target;
  onClear: () => void;
  onSectionChange: (n: SectionNumber) => void;
}) {
  if (target.kind === "gap") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-amber-300 bg-amber-50 rounded-md">
        <Inbox className="w-4 h-4 text-amber-700" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-stone-900">
            Filing a new gap{target.suggestedTitle ? `: "${target.suggestedTitle}"` : ""}
          </div>
          <div className="text-xs text-amber-800">Will appear in the gaps queue</div>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="text-stone-500 hover:text-stone-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const isManual = target.kind === "manual";
  const maturity = isValidMaturity(target.maturity) ? target.maturity : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 border border-stone-300 bg-stone-50 rounded-md">
        {isManual ? <BookOpen className="w-4 h-4 text-stone-700" /> : <FileText className="w-4 h-4 text-stone-700" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-stone-900 truncate">{target.title}</div>
          <div className="text-xs text-stone-500">
            {isManual ? "care response" : "how we work"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {target.isSensitive && (
            <span className="inline-flex items-center px-1 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700 text-[10px]">
              <Lock className="w-2.5 h-2.5" />
            </span>
          )}
          {maturity && (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] ${MATURITY_BADGE_CLS[maturity]}`}>
              {MATURITY_LABEL[maturity]}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="ml-1 text-stone-500 hover:text-stone-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isManual && (
        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">
            Which part? <span className="text-stone-400">(default: where it gets stuck)</span>
          </label>
          <select
            value={(target as { sectionNumber: SectionNumber }).sectionNumber}
            onChange={(e) => onSectionChange(Number(e.target.value) as SectionNumber)}
            className="w-full px-2 py-1.5 border border-stone-300 rounded text-sm bg-white"
          >
            {SECTION_NUMBERS.map((n) => (
              <option key={n} value={n}>
                {n}. {SECTION_LABELS[n]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function SuccessCard({ saved, onAddAnother }: { saved: Saved; onAddAnother: () => void }) {
  return (
    <div className="bg-white border border-emerald-200 rounded-lg p-6 text-center">
      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
      <h2 className="text-lg font-medium text-stone-900 mb-1">Saved.</h2>
      <p className="text-sm text-stone-600 mb-4">
        {saved.kind === "manual" && "Added as a practice note on the module."}
        {saved.kind === "page" && "Logged as a practice note on the page."}
        {saved.kind === "gap" && "Filed in the gaps queue for a curator to triage."}
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href={saved.destination.url}
          className="px-3 py-1.5 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800"
        >
          View → {saved.destination.label}
        </Link>
        <button
          type="button"
          onClick={onAddAnother}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 text-sm rounded-md hover:bg-stone-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Add another
        </button>
      </div>
    </div>
  );
}
