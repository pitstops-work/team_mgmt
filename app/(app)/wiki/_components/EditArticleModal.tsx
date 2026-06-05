"use client";

import { useState } from "react";
import { XIcon, AlertTriangleIcon, SaveIcon, GitForkIcon, HistoryIcon } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { fetchJson, FetchJsonError } from "@/lib/fetchJson";
import type { TipTapDoc } from "@/lib/wiki/tiptap";
import { RichEditor } from "./RichEditor";

export type EditArticleModalProps = {
  articleId: string;
  initialTitle: string;
  initialContent: TipTapDoc;
  /** How many distinct questions this article appears on (for the shared-edit banner). */
  appearsOnCount: number;
  /** Titles of (some of) the questions, for the banner copy. */
  appearsOnSample?: string[];
  /** The current question's article ID (if invoked from a fork panel). Enables Fork. */
  forkContext?: { questionArticleId: string; questionTitle: string; panel: string };
  onClose: () => void;
  onSaved: () => void;
  onOpenVersionHistory?: () => void;
  onForkRequested?: () => void;
};

export function EditArticleModal({
  articleId,
  initialTitle,
  initialContent,
  appearsOnCount,
  appearsOnSample,
  forkContext,
  onClose,
  onSaved,
  onOpenVersionHistory,
  onForkRequested,
}: EditArticleModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [doc, setDoc] = useState<TipTapDoc>(initialContent);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shared = appearsOnCount > 1;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await fetchJson(`/api/wiki/articles/${articleId}`, {
        method: "PATCH",
        json: { title, contentJson: doc, summary: summary || undefined },
      });
      onSaved();
    } catch (e) {
      const msg = e instanceof FetchJsonError ? e.message : (e instanceof Error ? e.message : "Save failed");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SurfaceProvider id="wiki.article_edit">
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/40 p-4">
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-stone-500">Edit article</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent text-lg font-semibold text-stone-900 outline-none"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onOpenVersionHistory && (
                <button onClick={onOpenVersionHistory} className="rounded p-1.5 text-stone-500 hover:bg-stone-100" title="Version history">
                  <HistoryIcon className="h-4 w-4" />
                </button>
              )}
              <button onClick={onClose} className="rounded p-1.5 text-stone-500 hover:bg-stone-100" title="Close">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </header>

          {shared && (
            <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">This article appears on {appearsOnCount} questions — edits apply everywhere.</div>
                {appearsOnSample && appearsOnSample.length > 0 && (
                  <div className="mt-0.5 text-amber-800">Including: {appearsOnSample.slice(0, 3).join(" · ")}{appearsOnCount > 3 ? ` · +${appearsOnCount - 3} more` : ""}</div>
                )}
                {forkContext && onForkRequested && (
                  <button
                    type="button"
                    onClick={onForkRequested}
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-amber-900 hover:bg-amber-100"
                  >
                    <GitForkIcon className="h-3 w-3" />
                    Fork into {forkContext.questionTitle}-only version
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            <RichEditor initialContent={initialContent} onChange={setDoc} />
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Optional change note ('fixed typo', 'added missing step', ...)"
              className="flex-1 rounded border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-amber-400"
              maxLength={200}
            />
            <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !title.trim()}
              className="inline-flex items-center gap-1 rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-stone-300"
            >
              <SaveIcon className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save new version"}
            </button>
          </footer>

          {error && (
            <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>
          )}
        </div>
      </div>
    </SurfaceProvider>
  );
}
