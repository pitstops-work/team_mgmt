"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, Search, Filter, Flag, MessageCircle, Users, Handshake } from "lucide-react";

type Tag = { tagType: string; tagValue: string };
type Page = {
  id: string;
  slug: string;
  title: string;
  type: "principle" | "playbook" | "runbook" | string;
  canonicalLang: string;
  status: string;
  lastEditedAt: string;
  nextReviewDue: string | null;
  owner: { id: string; name: string | null; image: string | null } | null;
  tags: Tag[];
  openFlagCount: number;
  unresolvedCommentCount: number;
};

const TYPE_LABEL: Record<string, string> = {
  principle: "Principle",
  playbook: "Playbook",
  runbook: "Runbook",
};

const TYPE_CLS: Record<string, string> = {
  principle: "bg-indigo-50 text-indigo-700 border-indigo-200",
  playbook: "bg-emerald-50 text-emerald-700 border-emerald-200",
  runbook: "bg-amber-50 text-amber-700 border-amber-200",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WikiListView({
  initialPages,
  canCreate,
}: {
  initialPages: Page[];
  canCreate: boolean;
}) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return initialPages.filter((p) => {
      if (typeFilter && p.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        p.title.toLowerCase().includes(needle) ||
        p.tags.some((t) => t.tagValue.toLowerCase().includes(needle))
      );
    });
  }, [initialPages, q, typeFilter]);

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-stone-700" />
            <h1 className="text-2xl font-semibold text-stone-900">Wiki</h1>
          </div>
          {canCreate && (
            <Link
              href="/wiki/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800"
            >
              <Plus className="w-4 h-4" />
              New page
            </Link>
          )}
        </header>

        <nav className="flex items-center gap-4 mb-6 text-sm">
          <Link href="/wiki" className="text-stone-900 font-medium border-b-2 border-stone-900 pb-1">
            Pages
          </Link>
          <Link href="/wiki/circles" className="text-stone-500 hover:text-stone-900 inline-flex items-center gap-1 pb-1">
            <Users className="w-3.5 h-3.5" />
            Circles
          </Link>
          <Link href="/wiki/partner-reviews" className="text-stone-500 hover:text-stone-900 inline-flex items-center gap-1 pb-1">
            <Handshake className="w-3.5 h-3.5" />
            Partner reviews
          </Link>
        </nav>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by title or tag…"
              className="w-full pl-8 pr-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-2.5 w-4 h-4 text-stone-400 pointer-events-none" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="pl-8 pr-8 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              <option value="">All types</option>
              <option value="principle">Principles</option>
              <option value="playbook">Playbooks</option>
              <option value="runbook">Runbooks</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-stone-500 text-sm">
            {initialPages.length === 0
              ? "No pages yet. Stewards can create the first one."
              : "No pages match this filter."}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/wiki/${p.slug}`}
                  className="block bg-white border border-stone-200 rounded-lg px-4 py-3 hover:border-stone-400 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_CLS[p.type] ?? "bg-stone-50 text-stone-700 border-stone-200"}`}
                        >
                          {TYPE_LABEL[p.type] ?? p.type}
                        </span>
                        <h2 className="font-medium text-stone-900 truncate">{p.title}</h2>
                        {p.status === "draft" && (
                          <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Draft</span>
                        )}
                        {p.openFlagCount > 0 && (
                          <span className="text-xs text-red-700 bg-red-50 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                            <Flag className="w-3 h-3" />
                            {p.openFlagCount}
                          </span>
                        )}
                        {p.unresolvedCommentCount > 0 && (
                          <span className="text-xs text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                            <MessageCircle className="w-3 h-3" />
                            {p.unresolvedCommentCount}
                          </span>
                        )}
                      </div>
                      {p.tags.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {p.tags.slice(0, 6).map((t) => (
                            <span
                              key={`${t.tagType}:${t.tagValue}`}
                              className="text-xs text-stone-500"
                            >
                              {t.tagType}:{t.tagValue}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-stone-500 shrink-0">
                      <div>{p.owner?.name ?? "Unowned"}</div>
                      <div>Edited {fmtDate(p.lastEditedAt)}</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
