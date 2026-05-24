"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { ArrowLeft, Save } from "lucide-react";

export default function WikiEditor({
  slug,
  initialTitle,
  initialContent,
  type,
}: {
  slug: string;
  initialTitle: string;
  initialContent: string;
  type: string;
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

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link
          href={`/wiki/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel
        </Link>

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
    </main>
  );
}
