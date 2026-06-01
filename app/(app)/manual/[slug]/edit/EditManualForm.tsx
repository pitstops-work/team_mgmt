"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Save, Eye } from "lucide-react";
import {
  SECTION_NUMBERS,
  SECTION_LABELS,
  SECTION_STABILITY,
  MATURITY_VALUES,
  MATURITY_LABEL,
  isValidMaturity,
  type Maturity,
  type SectionNumber,
} from "@/lib/wiki/manual";

type SectionInput = { sectionNumber: number; content: string };

const STABILITY_CHIP: Record<string, { label: string; cls: string }> = {
  stable: { label: "Stable", cls: "bg-stone-100 text-stone-600 border-stone-200" },
  between: { label: "Between", cls: "bg-stone-50 text-stone-500 border-stone-200" },
  living: { label: "Living", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

const STABILITY_HINT: Record<string, string> = {
  stable: "Spine content — author once, refine slowly.",
  between: "Seeded at the start; thickens steadily as practice arrives.",
  living: "Grows through practice circles. Prefer capture over direct edits.",
};

export default function EditManualForm({
  page,
  sections,
}: {
  page: {
    slug: string;
    title: string;
    canonicalContent: string;
    maturity: string | null;
    isSensitive: boolean;
    sensitiveNote: string | null;
  };
  sections: SectionInput[];
}) {
  const router = useRouter();

  const [title, setTitle] = useState(page.title);
  const [lede, setLede] = useState(page.canonicalContent ?? "");
  const [maturity, setMaturity] = useState<Maturity>(
    isValidMaturity(page.maturity) ? page.maturity : "mostly_theory",
  );
  const [isSensitive, setIsSensitive] = useState(page.isSensitive);
  const [sensitiveNote, setSensitiveNote] = useState(page.sensitiveNote ?? "");

  const initialMap = useMemo(() => {
    const m = new Map<number, string>();
    sections.forEach((s) => m.set(s.sectionNumber, s.content));
    SECTION_NUMBERS.forEach((n) => {
      if (!m.has(n)) m.set(n, "");
    });
    return m;
  }, [sections]);

  const [sectionContent, setSectionContent] = useState<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    SECTION_NUMBERS.forEach((n) => {
      out[n] = initialMap.get(n) ?? "";
    });
    return out;
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/manual/${page.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          lede: lede,
          maturity,
          isSensitive,
          sensitiveNote: isSensitive ? sensitiveNote.trim() || null : null,
          sections: SECTION_NUMBERS.map((n) => ({
            sectionNumber: n,
            content: sectionContent[n] ?? "",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setSavedAt(new Date());
      // Refresh the server data so the reader (and back-nav) sees the change.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/manual/${page.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to reader
          </Link>
          <Link
            href={`/manual/${page.slug}`}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-stone-600 hover:text-stone-900 border border-stone-300 rounded"
          >
            <Eye className="w-3 h-3" />
            Preview
          </Link>
        </div>

        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 mb-1">Edit module</h1>
          <p className="text-sm text-stone-600">
            Edit the spine (stable sections) carefully. For living sections, prefer the{" "}
            <Link href={`/wiki/capture?manual=${page.slug}`} className="text-amber-700 underline">
              Capture flow
            </Link>{" "}
            so attributed practice notes accumulate instead of being overwritten.
          </p>
        </header>

        {/* Meta */}
        <section className="bg-white border border-stone-200 rounded-lg p-5 mb-6 space-y-4">
          <h2 className="text-xs uppercase tracking-wide text-stone-500">Meta</h2>

          <div>
            <label className="block text-sm font-medium text-stone-800 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-800 mb-2">Maturity</label>
            <div className="flex flex-wrap gap-3">
              {MATURITY_VALUES.map((m) => (
                <label key={m} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="maturity"
                    value={m}
                    checked={maturity === m}
                    onChange={() => setMaturity(m)}
                  />
                  {MATURITY_LABEL[m]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isSensitive}
                onChange={(e) => setIsSensitive(e.target.checked)}
              />
              <Lock className="w-3.5 h-3.5 text-rose-600" />
              <span className="text-sm text-stone-800">Sensitive — restricted handling</span>
            </label>
            {isSensitive && (
              <input
                type="text"
                value={sensitiveNote}
                onChange={(e) => setSensitiveNote(e.target.value)}
                placeholder="e.g. EVRAT §20 restricted handling"
                className="mt-2 w-full px-3 py-1.5 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-800 mb-1">Lede</label>
            <textarea
              value={lede}
              onChange={(e) => setLede(e.target.value)}
              rows={3}
              placeholder="1-2 sentences naming what this module is"
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>
        </section>

        {/* Sections */}
        <section className="space-y-6">
          {SECTION_NUMBERS.map((n) => (
            <SectionEditor
              key={n}
              number={n}
              value={sectionContent[n] ?? ""}
              onChange={(v) => setSectionContent((prev) => ({ ...prev, [n]: v }))}
            />
          ))}
        </section>

        {error && (
          <div className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            {error}
          </div>
        )}

        {/* Sticky save bar */}
        <div className="sticky bottom-0 -mx-4 mt-6 bg-white/95 border-t border-stone-200 px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-stone-500">
            {savedAt
              ? `Saved ${savedAt.toLocaleTimeString()}`
              : "Unsaved changes will be lost when you leave"}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/manual/${page.slug}`}
              className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
            >
              Done
            </Link>
            <button
              type="button"
              onClick={save}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function SectionEditor({
  number,
  value,
  onChange,
}: {
  number: SectionNumber;
  value: string;
  onChange: (v: string) => void;
}) {
  const stability = SECTION_STABILITY[number];
  const chip = STABILITY_CHIP[stability];
  const hint = STABILITY_HINT[stability];
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-base font-semibold text-stone-900">
          <span className="text-stone-400 tabular-nums mr-2">{number}.</span>
          {SECTION_LABELS[number]}
        </h3>
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide border ${chip.cls}`}
        >
          {chip.label}
        </span>
      </div>
      <p className="text-xs text-stone-500 mb-2">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(6, Math.min(20, value.split("\n").length + 2))}
        placeholder="Markdown — supports GFM tables, headings, lists, quotes."
        className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-stone-400"
      />
    </div>
  );
}
