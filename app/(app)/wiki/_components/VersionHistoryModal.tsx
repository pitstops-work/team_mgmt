"use client";

import { useEffect, useState } from "react";
import { XIcon, RotateCcwIcon } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { fetchJson, FetchJsonError } from "@/lib/fetchJson";
import { ArticleRenderer } from "./ArticleRenderer";
import type { TipTapDoc } from "@/lib/wiki/tiptap";

type Version = {
  id: string;
  versionNumber: number;
  title: string;
  contentJson: TipTapDoc;
  savedAt: string;
  summary: string | null;
  savedBy: { id: string; name: string | null; image: string | null };
};

export function VersionHistoryModal({
  articleId,
  articleTitle,
  onClose,
  onRestored,
}: {
  articleId: string;
  articleTitle: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selected, setSelected] = useState<Version | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ versions: Version[] }>(`/api/wiki/articles/${articleId}/versions`)
      .then((r) => { setVersions(r.versions); if (r.versions[0]) setSelected(r.versions[0]); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [articleId]);

  const restore = async (v: Version) => {
    if (!confirm(`Restore article to v${v.versionNumber}? A new version (with this content) will be written.`)) return;
    setRestoring(true);
    setError(null);
    try {
      await fetchJson(`/api/wiki/articles/${articleId}/restore`, {
        method: "POST",
        json: { versionNumber: v.versionNumber },
      });
      onRestored();
    } catch (e) {
      setError(e instanceof FetchJsonError ? e.message : (e instanceof Error ? e.message : "Restore failed"));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SurfaceProvider id="wiki.version_history">
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-900/50 p-4">
        <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500">Version history</div>
              <div className="text-base font-semibold text-stone-900">{articleTitle}</div>
            </div>
            <button onClick={onClose} className="rounded p-1.5 text-stone-500 hover:bg-stone-100">
              <XIcon className="h-4 w-4" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="w-72 shrink-0 overflow-y-auto border-r border-stone-200 bg-stone-50">
              {error && <div className="p-3 text-xs text-red-700">{error}</div>}
              {!versions && !error && <div className="p-3 text-xs text-stone-400">Loading…</div>}
              {versions && versions.length === 0 && <div className="p-3 text-xs text-stone-500">No versions yet.</div>}
              {versions && (
                <ul className="divide-y divide-stone-200">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(v)}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs ${selected?.id === v.id ? "bg-white" : "hover:bg-white/60"}`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="font-medium text-stone-900">v{v.versionNumber}</span>
                          <span className="text-[10px] text-stone-500">{new Date(v.savedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="text-[10px] text-stone-500">{v.savedBy.name ?? "—"}</div>
                        {v.summary && <div className="text-[10px] italic text-stone-600">{v.summary}</div>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <main className="flex min-w-0 flex-1 flex-col">
              {selected && (
                <>
                  <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2 text-xs">
                    <div className="text-stone-600">
                      <span className="font-medium">v{selected.versionNumber}</span> · {new Date(selected.savedAt).toLocaleString()} · {selected.savedBy.name ?? "—"}
                    </div>
                    <button
                      type="button"
                      onClick={() => restore(selected)}
                      disabled={restoring}
                      className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700 disabled:bg-stone-300"
                    >
                      <RotateCcwIcon className="h-3 w-3" />
                      {restoring ? "Restoring…" : "Restore this version"}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <h2 className="mb-3 text-base font-semibold">{selected.title}</h2>
                    <ArticleRenderer doc={selected.contentJson} />
                  </div>
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </SurfaceProvider>
  );
}
