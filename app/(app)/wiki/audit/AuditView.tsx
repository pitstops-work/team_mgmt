"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Archive, History } from "lucide-react";

type Row = {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  canonicalLang: string;
  lastEditedAt: string;
  nextReviewDue: string | null;
  owner: { id: string; name: string | null } | null;
  views: number;
  flagsTotal: number;
  versions: number;
  translationCount: number;
  daysSinceReview: number | null;
  ownerTenureDays: number | null;
};

const STATUS_FILTERS = ["all", "draft", "published", "under_review", "orphaned"] as const;

export default function AuditView({ pages }: { pages: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [sortBy, setSortBy] = useState<"title" | "views" | "flags" | "review">("title");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    let arr = pages.slice();
    if (statusFilter !== "all") arr = arr.filter((p) => p.status === statusFilter);
    arr.sort((a, b) => {
      switch (sortBy) {
        case "views":
          return b.views - a.views;
        case "flags":
          return b.flagsTotal - a.flagsTotal;
        case "review":
          return (b.daysSinceReview ?? 0) - (a.daysSinceReview ?? 0);
        default:
          return a.title.localeCompare(b.title);
      }
    });
    return arr;
  }, [pages, statusFilter, sortBy]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  }

  async function bulkApply(status: "retired" | "under_review") {
    if (selected.size === 0) return;
    const verb = status === "retired" ? "retire" : "mark for revision";
    if (!confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} ${selected.size} page${selected.size === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    const res = await fetch("/api/admin/wiki/bulk-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: Array.from(selected), status }),
    });
    setBusy(false);
    if (res.ok) {
      setSelected(new Set());
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link href="/wiki" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Wiki
        </Link>

        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-stone-900 inline-flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-stone-600" />
            Annual audit
          </h1>
          <div className="text-xs text-stone-500">
            {filtered.length} pages · {selected.size} selected
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-stone-500">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number])}
              className="px-2 py-1 border border-stone-300 rounded bg-white"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-stone-500">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2 py-1 border border-stone-300 rounded bg-white"
            >
              <option value="title">Title (A-Z)</option>
              <option value="views">Most viewed</option>
              <option value="flags">Most flagged</option>
              <option value="review">Longest since review</option>
            </select>
          </label>
          {selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => bulkApply("under_review")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded text-sm text-stone-700 hover:border-red-400 hover:text-red-700 disabled:opacity-50"
              >
                <History className="w-4 h-4" />
                Mark under review
              </button>
              <button
                type="button"
                onClick={() => bulkApply("retired")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-300 bg-red-50 text-red-700 rounded text-sm hover:bg-red-100 disabled:opacity-50"
              >
                <Archive className="w-4 h-4" />
                Retire
              </button>
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="text-left px-2 py-2">Title</th>
                <th className="text-left px-2 py-2 hidden md:table-cell">Owner</th>
                <th className="text-left px-2 py-2 hidden lg:table-cell">Status</th>
                <th className="text-right px-2 py-2">Views</th>
                <th className="text-right px-2 py-2">Flags</th>
                <th className="text-right px-2 py-2 hidden md:table-cell">Edits</th>
                <th className="text-right px-2 py-2 hidden lg:table-cell">Trans</th>
                <th className="text-right px-2 py-2">Review</th>
                <th className="text-right px-2 py-2 hidden xl:table-cell">Tenure</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-stone-600 hidden md:table-cell">
                    {p.owner?.name ?? <span className="text-stone-400">—</span>}
                  </td>
                  <td className="px-2 py-2 text-stone-500 hidden lg:table-cell">{p.status}</td>
                  <td className="px-2 py-2 text-right text-stone-700">{p.views}</td>
                  <td className="px-2 py-2 text-right text-stone-700">{p.flagsTotal}</td>
                  <td className="px-2 py-2 text-right text-stone-700 hidden md:table-cell">{p.versions}</td>
                  <td className="px-2 py-2 text-right text-stone-700 hidden lg:table-cell">{p.translationCount}</td>
                  <td className="px-2 py-2 text-right text-stone-600">
                    {p.daysSinceReview === null ? "—" : `${p.daysSinceReview}d`}
                  </td>
                  <td className="px-2 py-2 text-right text-stone-600 hidden xl:table-cell">
                    {p.ownerTenureDays === null ? "—" : `${p.ownerTenureDays}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
