"use client";

import { useCallback, useEffect, useState } from "react";
import { XIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { fetchJson, FetchJsonError } from "@/lib/fetchJson";
import type { Panel } from "@/lib/wiki/articles";

type LinkRow = {
  id: string;
  panel: Panel;
  ordinal: number;
  to: { id: string; slug: string; title: string; kind: string };
};

type SearchResult = { id: string; slug: string; title: string; kind: string };

const PANEL_LABEL: Record<Panel, string> = {
  guideline: "Guideline",
  care_plan: "Care plan",
  action_manual: "Action manual",
};

export function LinkManager({
  questionArticleId,
  questionTitle,
  panel,
  onClose,
  onChanged,
}: {
  questionArticleId: string;
  questionTitle: string;
  panel: Panel;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetchJson<{ links: LinkRow[] }>(`/api/wiki/articles/${questionArticleId}/links`);
      setLinks(r.links.filter((l) => l.panel === panel));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [questionArticleId, panel]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetchJson<{ results: SearchResult[] }>(`/api/wiki/search?q=${encodeURIComponent(q)}&limit=15`);
        setResults(r.results);
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const addLink = async (toArticleId: string) => {
    setError(null);
    try {
      await fetchJson(`/api/wiki/articles/${questionArticleId}/links`, {
        method: "POST",
        json: { toArticleId, panel },
      });
      setSearch("");
      setResults([]);
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof FetchJsonError ? e.message : (e instanceof Error ? e.message : "Add failed"));
    }
  };

  const removeLink = async (linkId: string) => {
    if (!confirm("Remove this article from the panel? The article itself is unchanged.")) return;
    try {
      await fetchJson(`/api/wiki/articles/${questionArticleId}/links/${linkId}`, { method: "DELETE" });
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof FetchJsonError ? e.message : (e instanceof Error ? e.message : "Remove failed"));
    }
  };

  const move = async (link: LinkRow, dir: -1 | 1) => {
    if (!links) return;
    const idx = links.findIndex((l) => l.id === link.id);
    const other = links[idx + dir];
    if (!other) return;
    try {
      await Promise.all([
        fetchJson(`/api/wiki/articles/${questionArticleId}/links/${link.id}`, { method: "PATCH", json: { ordinal: other.ordinal } }),
        fetchJson(`/api/wiki/articles/${questionArticleId}/links/${other.id}`, { method: "PATCH", json: { ordinal: link.ordinal } }),
      ]);
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
    }
  };

  return (
    <SurfaceProvider id="wiki.link_manager">
      <div className="fixed inset-0 z-[105] flex items-center justify-center bg-stone-900/40 p-4">
        <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500">Manage {PANEL_LABEL[panel]} for</div>
              <div className="text-base font-semibold text-stone-900">{questionTitle}</div>
            </div>
            <button onClick={onClose} className="rounded p-1.5 text-stone-500 hover:bg-stone-100"><XIcon className="h-4 w-4" /></button>
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Currently linked</h3>
            {!links && <div className="text-xs text-stone-400">Loading…</div>}
            {links && links.length === 0 && <div className="rounded border border-dashed border-stone-300 p-3 text-xs text-stone-500">Nothing linked. Search below to add.</div>}
            {links && links.length > 0 && (
              <ol className="divide-y divide-stone-100 rounded-md border border-stone-200">
                {links.map((l, i) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-stone-900">{l.to.title}</div>
                      <div className="text-[10px] text-stone-500">{l.to.kind.replace(/_/g, " ")} · {l.to.slug}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => move(l, -1)} disabled={i === 0} className="rounded p-1 text-stone-400 hover:bg-stone-100 disabled:text-stone-200" title="Move up">↑</button>
                      <button onClick={() => move(l, 1)} disabled={i === links.length - 1} className="rounded p-1 text-stone-400 hover:bg-stone-100 disabled:text-stone-200" title="Move down">↓</button>
                      <button onClick={() => removeLink(l.id)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Remove">
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500">Add article</h3>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              className="w-full rounded border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            {results.length > 0 && (
              <ul className="mt-2 max-h-64 divide-y divide-stone-100 overflow-y-auto rounded-md border border-stone-200">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => addLink(r.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-amber-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-stone-900">{r.title}</div>
                        <div className="text-[10px] text-stone-500">{r.kind.replace(/_/g, " ")} · {r.slug}</div>
                      </div>
                      <PlusIcon className="h-4 w-4 shrink-0 text-amber-700" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
        </div>
      </div>
    </SurfaceProvider>
  );
}
