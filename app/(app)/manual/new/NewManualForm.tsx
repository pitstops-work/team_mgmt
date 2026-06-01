"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Lock } from "lucide-react";
import {
  MATURITY_VALUES,
  MATURITY_LABEL,
  MATURITY_TRUST_COPY,
  type Maturity,
} from "@/lib/wiki/manual";

function slugifyTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function NewManualForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [maturity, setMaturity] = useState<Maturity>("mostly_theory");
  const [isSensitive, setIsSensitive] = useState(false);
  const [sensitiveNote, setSensitiveNote] = useState("");
  const [lede, setLede] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-slug from title until the user manually edits the slug.
  useEffect(() => {
    if (!slugTouched) setSlug(slugifyTitle(title));
  }, [title, slugTouched]);

  async function submit() {
    if (!title.trim() || !slug.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          maturity,
          isSensitive,
          sensitiveNote: isSensitive ? sensitiveNote.trim() || null : null,
          lede: lede.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create");
        return;
      }
      // After creation, drop straight into the section editor.
      router.push(`/manual/${data.manual.slug}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link
          href="/manual"
          className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Manual
        </Link>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1 text-xs uppercase tracking-wide text-stone-500">
            <BookOpen className="w-3.5 h-3.5" />
            New response module
          </div>
          <h1 className="text-2xl font-semibold text-stone-900 mb-1">Create a new module</h1>
          <p className="text-sm text-stone-600">
            Creates the empty 8-section skeleton. You'll fill the spine on the next screen;
            living sections grow over time from practice circles.
          </p>
        </header>

        <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-stone-800 mb-1">
              Title <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cataract Referral"
              autoFocus
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-800 mb-1">
              Slug <span className="text-rose-600">*</span>
              <span className="text-xs font-normal text-stone-500 ml-2">
                used in the URL — /manual/<span className="font-mono">{slug || "…"}</span>
              </span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugifyTitle(e.target.value));
              }}
              placeholder="auto-generated from title"
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-800 mb-2">Maturity</label>
            <div className="flex flex-col gap-1.5">
              {MATURITY_VALUES.map((m) => (
                <label key={m} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="maturity"
                    value={m}
                    checked={maturity === m}
                    onChange={() => setMaturity(m)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm font-medium text-stone-800">{MATURITY_LABEL[m]}</span>
                    <span className="block text-xs text-stone-500">{MATURITY_TRUST_COPY[m]}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2 italic">
              Most new modules start as <em>mostly theory</em> — empty sections are a map of what
              practice hasn't taught yet.
            </p>
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
            <label className="block text-sm font-medium text-stone-800 mb-1">
              Lede <span className="text-xs font-normal text-stone-500">(optional, shown above the sections)</span>
            </label>
            <textarea
              value={lede}
              onChange={(e) => setLede(e.target.value)}
              rows={3}
              placeholder="1-2 sentences naming what this module is and what it isn't"
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Link href="/manual" className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900">
              Cancel
            </Link>
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim() || !slug.trim() || submitting}
              className="px-4 py-1.5 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating…" : "Create empty 8-section skeleton"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
