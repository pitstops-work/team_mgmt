"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Languages, Check } from "lucide-react";

type Flag = {
  id: string;
  language: string;
  reason: string;
  createdAt: string;
  flagger: { id: string; name: string | null };
  page: { id: string; slug: string; title: string };
};

const LANG_LABELS: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  kn: "Kannada",
  ml: "Malayalam",
  hi: "Hindi",
  bn: "Bengali",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TranslationQueueView({ flags: initialFlags }: { flags: Flag[] }) {
  const router = useRouter();
  const [flags, setFlags] = useState<Flag[]>(initialFlags);
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusy(id);
    const res = await fetch(`/api/wiki/translation-flags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    setBusy(null);
    if (res.ok) {
      setFlags((prev) => prev.filter((f) => f.id !== id));
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/wiki" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Wiki
        </Link>

        <h1 className="text-2xl font-semibold text-stone-900 mb-6 inline-flex items-center gap-2">
          <Languages className="w-5 h-5 text-stone-600" />
          Translation queue ({flags.length})
        </h1>

        {flags.length === 0 ? (
          <p className="text-sm text-stone-500 text-center py-12">
            No open translation flags. The pipeline's clean.
          </p>
        ) : (
          <ul className="space-y-2">
            {flags.map((f) => (
              <li
                key={f.id}
                className="bg-white border border-stone-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Link
                        href={`/wiki/${f.page.slug}`}
                        className="font-medium text-stone-900 hover:underline"
                      >
                        {f.page.title}
                      </Link>
                      <span className="text-xs bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded">
                        {LANG_LABELS[f.language] ?? f.language}
                      </span>
                    </div>
                    <p className="text-sm text-stone-700 whitespace-pre-wrap">{f.reason}</p>
                    <div className="text-xs text-stone-500 mt-1">
                      {f.flagger.name ?? "Someone"} · {fmtDate(f.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => resolve(f.id)}
                    disabled={busy === f.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-emerald-700 border border-emerald-300 rounded hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    Resolve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
