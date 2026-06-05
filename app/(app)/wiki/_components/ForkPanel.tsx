"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, XIcon, EditIcon, ExternalLinkIcon, RefreshCwIcon, Settings2Icon } from "lucide-react";
import { fetchJson, FetchJsonError } from "@/lib/fetchJson";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { ArticleRenderer } from "./ArticleRenderer";
import { EditArticleModal } from "./EditArticleModal";
import { VersionHistoryModal } from "./VersionHistoryModal";
import { LinkManager } from "./LinkManager";
import type { TipTapDoc } from "@/lib/wiki/tiptap";
import type { ArticleWithLinks, Panel } from "@/lib/wiki/articles";

export type ForkPanelProps = {
  questionArticleId: string;
  questionTitle: string;
  panel: Panel;
  folded: boolean;
  onToggleFold: () => void;
  onClose: () => void;
};

type LinkedArticle = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  contentJson: TipTapDoc;
};

const PANEL_LABEL: Record<Panel, string> = {
  guideline: "Guideline",
  care_plan: "Care plan",
  action_manual: "Action manual",
};

const PANEL_COLOR: Record<Panel, string> = {
  guideline:     "border-sky-300 bg-sky-50",
  care_plan:     "border-emerald-300 bg-emerald-50",
  action_manual: "border-amber-300 bg-amber-50",
};

const PANEL_HEADER_COLOR: Record<Panel, string> = {
  guideline:     "bg-sky-100 text-sky-900",
  care_plan:     "bg-emerald-100 text-emerald-900",
  action_manual: "bg-amber-100 text-amber-900",
};

export function ForkPanel({
  questionArticleId,
  questionTitle,
  panel,
  folded,
  onToggleFold,
  onClose,
}: ForkPanelProps) {
  const [articles, setArticles] = useState<LinkedArticle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [editingFull, setEditingFull] = useState<ArticleWithLinks | null>(null);
  const [versionsFor, setVersionsFor] = useState<{ id: string; title: string } | null>(null);
  const [linkManagerOpen, setLinkManagerOpen] = useState(false);
  const [forking, setForking] = useState(false);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setArticles(null);
    setError(null);
    fetchJson<{ articles: LinkedArticle[] }>(
      `/api/wiki/articles/${questionArticleId}/panel?panel=${panel}`,
    )
      .then((r) => { if (!cancelled) setArticles(r.articles); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [questionArticleId, panel, refreshNonce]);

  const openEditor = async (articleId: string) => {
    try {
      const r = await fetchJson<{ article: ArticleWithLinks }>(`/api/wiki/articles/${articleId}`);
      setEditingFull(r.article);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load article");
    }
  };

  if (folded) {
    return (
      <button
        type="button"
        onClick={onToggleFold}
        className={`flex h-full w-10 shrink-0 flex-col items-center gap-2 border-l ${PANEL_COLOR[panel]} py-3 hover:brightness-95`}
        title={`Expand ${PANEL_LABEL[panel]} — ${questionTitle}`}
      >
        <div className="rotate-180 text-xs font-medium [writing-mode:vertical-rl]">
          {PANEL_LABEL[panel]} — {questionTitle}
        </div>
      </button>
    );
  }

  return (
    <SurfaceProvider id="wiki.fork_panel">
      <div className={`flex h-full w-[420px] shrink-0 flex-col border-l ${PANEL_COLOR[panel]}`}>
        <div className={`flex items-center justify-between gap-1 border-b border-stone-200 px-3 py-2 ${PANEL_HEADER_COLOR[panel]}`}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wide opacity-70">{PANEL_LABEL[panel]}</div>
            <div className="truncate text-sm font-medium" title={questionTitle}>{questionTitle}</div>
          </div>
          <button onClick={() => setLinkManagerOpen(true)} className="rounded p-1 hover:bg-black/10" title="Manage linked articles">
            <Settings2Icon className="h-4 w-4" />
          </button>
          <button onClick={refresh} className="rounded p-1 hover:bg-black/10" title="Refresh">
            <RefreshCwIcon className="h-4 w-4" />
          </button>
          <button onClick={onToggleFold} className="rounded p-1 hover:bg-black/10" title="Fold panel">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-black/10" title="Close panel">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          {error && <div className="p-4 text-sm text-red-700">Error: {error}</div>}
          {!error && !articles && <div className="p-4 text-sm text-stone-400">Loading…</div>}
          {articles && articles.length === 0 && (
            <div className="p-4 text-sm italic text-stone-500">
              No {PANEL_LABEL[panel].toLowerCase()} content linked to this question yet.
            </div>
          )}
          {articles && articles.length > 0 && (
            <div className="divide-y divide-stone-100">
              {articles.map((art) => (
                <article key={art.id} className="px-4 py-3">
                  <header className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-stone-900">{art.title}</h3>
                    <div className="flex shrink-0 gap-1">
                      <Link
                        href={`/wiki/a/${art.slug}`}
                        className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                        title="Open article"
                      >
                        <ExternalLinkIcon className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEditor(art.id)}
                        className="rounded p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                        title="Edit"
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </header>
                  <ArticleRenderer doc={art.contentJson} />
                </article>
              ))}
            </div>
          )}
        </div>

        {editingFull && (
          <EditArticleModal
            articleId={editingFull.id}
            initialTitle={editingFull.title}
            initialContent={editingFull.contentJson}
            appearsOnCount={new Set(editingFull.backlinks.map((b) => b.article.id)).size}
            appearsOnSample={editingFull.backlinks.map((b) => b.article.title)}
            forkContext={{ questionArticleId, questionTitle, panel }}
            onClose={() => setEditingFull(null)}
            onSaved={() => {
              setEditingFull(null);
              refresh();
            }}
            onOpenVersionHistory={() => setVersionsFor({ id: editingFull.id, title: editingFull.title })}
            onForkRequested={async () => {
              if (forking) return;
              if (!confirm(`Create a "${questionTitle}"-only copy of "${editingFull.title}"? Other questions linked to this article will keep showing the original.`)) return;
              setForking(true);
              try {
                await fetchJson(`/api/wiki/articles/${editingFull.id}/fork`, {
                  method: "POST",
                  json: { fromQuestionArticleId: questionArticleId, panel },
                });
                setEditingFull(null);
                refresh();
              } catch (e) {
                alert(e instanceof FetchJsonError ? e.message : (e instanceof Error ? e.message : "Fork failed"));
              } finally {
                setForking(false);
              }
            }}
          />
        )}

        {linkManagerOpen && (
          <LinkManager
            questionArticleId={questionArticleId}
            questionTitle={questionTitle}
            panel={panel}
            onClose={() => setLinkManagerOpen(false)}
            onChanged={refresh}
          />
        )}

        {versionsFor && (
          <VersionHistoryModal
            articleId={versionsFor.id}
            articleTitle={versionsFor.title}
            onClose={() => setVersionsFor(null)}
            onRestored={() => {
              setVersionsFor(null);
              setEditingFull(null);
              refresh();
            }}
          />
        )}
      </div>
    </SurfaceProvider>
  );
}
