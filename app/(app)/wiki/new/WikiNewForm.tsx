"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

type User = { id: string; name: string | null; email: string };

const SUPPORTED_LANGS = [
  { code: "en", label: "English" },
  { code: "ta", label: "Tamil" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
];

export default function WikiNewForm({ users }: { users: User[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"principle" | "playbook" | "runbook">("playbook");
  const [canonicalLang, setCanonicalLang] = useState("en");
  const [ownerId, setOwnerId] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // tagsText format: "vertical:livelihoods, city:bangalore"
    const tags = tagsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [tagType, ...rest] = s.split(":");
        return { tagType: tagType.trim(), tagValue: rest.join(":").trim() };
      })
      .filter((t) => t.tagType && t.tagValue);

    const res = await fetch("/api/wiki/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        type,
        canonicalLang,
        ownerId: ownerId || null,
        tags,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Create failed");
      setSaving(false);
      return;
    }

    const data = await res.json();
    router.push(`/wiki/${data.page.slug}/edit`);
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-xl mx-auto px-4 py-6">
        <Link
          href="/wiki"
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          All pages
        </Link>

        <h1 className="text-2xl font-semibold text-stone-900 mb-6">New wiki page</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              <option value="principle">Principle</option>
              <option value="playbook">Playbook</option>
              <option value="runbook">Runbook</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Canonical language
            </label>
            <select
              value={canonicalLang}
              onChange={(e) => setCanonicalLang(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              {SUPPORTED_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Owner (optional — assigns 6-month term)
            </label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              <option value="">No owner yet</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Tags (optional)
            </label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="vertical:livelihoods, city:bangalore"
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
            <p className="mt-1 text-xs text-stone-500">
              Comma-separated <code className="bg-stone-100 px-1 rounded">tagType:tagValue</code> pairs.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link
              href="/wiki"
              className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
