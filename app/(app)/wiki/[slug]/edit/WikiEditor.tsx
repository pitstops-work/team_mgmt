"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { ArrowLeft, Save, Flag, MessageCircle } from "lucide-react";

type User = { id: string; name: string | null; image: string | null };
type FlagItem = {
  id: string;
  reason: string;
  sectionAnchor: string | null;
  status: string;
  createdAt: string;
  flagger: User;
};
type CommentItem = {
  id: string;
  body: string;
  sectionAnchor: string | null;
  createdAt: string;
  author: User;
};

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function WikiEditor({
  slug,
  initialTitle,
  initialContent,
  type,
  openFlags,
  unresolvedComments,
}: {
  slug: string;
  initialTitle: string;
  initialContent: string;
  type: string;
  openFlags: FlagItem[];
  unresolvedComments: CommentItem[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), Markdown],
    content: initialContent,
    immediatelyRender: false,
  });

  async function onSave() {
    if (!editor) return;
    setSaving(true);
    setError(null);

    const md = (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
    const res = await fetch(`/api/wiki/pages/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        canonicalContent: md,
        changeNote: changeNote || undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Save failed");
      setSaving(false);
      return;
    }

    router.push(`/wiki/${slug}`);
    router.refresh();
  }

  const hasContext = openFlags.length > 0 || unresolvedComments.length > 0;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link
          href={`/wiki/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel
        </Link>

        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-8">
          {/* ─── Main editor column ────────────────────────────────────── */}
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500 mb-2">{type}</div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-3xl font-semibold text-stone-900 bg-transparent border-0 border-b border-stone-200 focus:border-stone-500 focus:outline-none pb-2 mb-6"
              placeholder="Page title"
            />

            <div className="bg-white border border-stone-200 rounded-lg p-4">
              <EditorContent
                editor={editor}
                className="prose prose-stone max-w-none min-h-[400px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[400px]"
              />
            </div>

            <div className="mt-4">
              <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">
                Change note (optional)
              </label>
              <input
                type="text"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="What changed and why?"
                className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>

            {error && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <Link
                href={`/wiki/${slug}`}
                className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
              >
                Cancel
              </Link>
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !title.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {/* ─── Read-only context panel ───────────────────────────────── */}
          <aside className="mt-10 lg:mt-0">
            <div className="lg:sticky lg:top-6 space-y-4">
              {!hasContext && (
                <p className="text-xs text-stone-500 italic">
                  No open flags or unresolved comments — go forth and edit.
                </p>
              )}

              {openFlags.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-stone-800 inline-flex items-center gap-1.5 mb-2">
                    <Flag className="w-4 h-4 text-amber-600" />
                    Open flags ({openFlags.length})
                  </h2>
                  <ul className="space-y-2">
                    {openFlags.map((f) => (
                      <li key={f.id} className="bg-white border border-amber-200 rounded p-2.5 text-sm">
                        <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                          <span>{f.flagger.name ?? "Someone"} · {fmtRelative(f.createdAt)}</span>
                          <span className="text-[10px] uppercase tracking-wide bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                            {f.status}
                          </span>
                        </div>
                        {f.sectionAnchor && (
                          <div className="text-[11px] text-stone-500 mb-1">§{f.sectionAnchor}</div>
                        )}
                        <p className="text-stone-800 whitespace-pre-wrap break-words">{f.reason}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {unresolvedComments.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-stone-800 inline-flex items-center gap-1.5 mb-2">
                    <MessageCircle className="w-4 h-4 text-stone-500" />
                    Unresolved comments ({unresolvedComments.length})
                  </h2>
                  <ul className="space-y-2">
                    {unresolvedComments.map((c) => (
                      <li key={c.id} className="bg-white border border-stone-200 rounded p-2.5 text-sm">
                        <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                          <span>{c.author.name ?? "Someone"} · {fmtRelative(c.createdAt)}</span>
                        </div>
                        {c.sectionAnchor && (
                          <div className="text-[11px] text-stone-500 mb-1">§{c.sectionAnchor}</div>
                        )}
                        <p className="text-stone-800 whitespace-pre-wrap break-words">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
