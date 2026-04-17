"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Target, CheckSquare, MessageSquare, Search } from "lucide-react";

interface GoalResult {
  id: string;
  title: string;
  description?: string | null;
}

interface PitstopResult {
  id: string;
  title: string;
  goal: { id: string; title: string };
}

interface MessageResult {
  id: string;
  body: string;
  thread: {
    id: string;
    pitstop: {
      id: string;
      goal: { id: string; title: string };
    };
  };
}

interface SearchResults {
  goals: GoalResult[];
  pitstops: PitstopResult[];
  messages: MessageResult[];
}

type ResultItem =
  | { kind: "goal"; id: string; href: string; label: string; subtitle?: string }
  | { kind: "pitstop"; id: string; href: string; label: string; subtitle?: string }
  | { kind: "message"; id: string; href: string; label: string; subtitle?: string };

export default function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autofocus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data);
      } catch {
        setResults({ goals: [], pitstops: [], messages: [] });
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Flatten results into a single navigable list
  const items: ResultItem[] = [];
  if (results) {
    for (const g of results.goals) {
      items.push({ kind: "goal", id: g.id, href: `/goals/${g.id}`, label: g.title, subtitle: g.description ?? undefined });
    }
    for (const p of results.pitstops) {
      items.push({ kind: "pitstop", id: p.id, href: `/goals/${p.goal.id}/pitstops/${p.id}`, label: p.title, subtitle: p.goal.title });
    }
    for (const m of results.messages) {
      items.push({
        kind: "message",
        id: m.id,
        href: `/goals/${m.thread.pitstop.goal.id}/pitstops/${m.thread.pitstop.id}`,
        label: m.body.length > 80 ? m.body.slice(0, 80) + "…" : m.body,
        subtitle: m.thread.pitstop.goal.title,
      });
    }
  }

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && items[selectedIndex]) {
        navigate(items[selectedIndex].href);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, items, selectedIndex, navigate, onClose]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && !loading && results && items.length === 0;

  const groupLabel: Record<ResultItem["kind"], string> = {
    goal: "Goals",
    pitstop: "Pitstops",
    message: "Threads",
  };

  const IconFor = ({ kind }: { kind: ResultItem["kind"] }) => {
    if (kind === "goal") return <Target className="w-4 h-4 text-sky-500 flex-shrink-0" />;
    if (kind === "pitstop") return <CheckSquare className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    return <MessageSquare className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  };

  // Render grouped sections
  const kinds: ResultItem["kind"][] = ["goal", "pitstop", "message"];
  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden mx-4">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
          <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search goals, pitstops, threads…"
            className="flex-1 text-sm text-stone-800 placeholder:text-stone-400 outline-none bg-transparent"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-stone-200 border-t-sky-400 rounded-full animate-spin flex-shrink-0" />
          )}
          <kbd className="hidden sm:inline-block text-[10px] text-stone-400 border border-stone-200 rounded px-1.5 py-0.5 flex-shrink-0">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {!hasQuery && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Search className="w-7 h-7 text-stone-200 mb-2" />
              <p className="text-sm text-stone-400">Type to search across goals, pitstops, and threads</p>
            </div>
          )}

          {noResults && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <p className="text-sm text-stone-400">No results for <span className="font-medium text-stone-600">"{query}"</span></p>
            </div>
          )}

          {items.length > 0 && (
            <div className="py-2">
              {kinds.map((kind) => {
                const groupItems = items.filter((it) => it.kind === kind);
                if (groupItems.length === 0) return null;
                return (
                  <div key={kind}>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">{groupLabel[kind]}</p>
                    {groupItems.map((item) => {
                      const idx = flatIdx++;
                      return (
                        <button
                          key={item.id + item.href}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          onClick={() => navigate(item.href)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            selectedIndex === idx ? "bg-stone-50" : "hover:bg-stone-50"
                          }`}
                        >
                          <IconFor kind={item.kind} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-800 truncate">{item.label}</p>
                            {item.subtitle && (
                              <p className="text-xs text-stone-400 truncate">{item.subtitle}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {items.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-stone-100 bg-stone-50">
            <span className="text-[10px] text-stone-400">↑↓ navigate</span>
            <span className="text-[10px] text-stone-400">↵ open</span>
            <span className="text-[10px] text-stone-400">Esc close</span>
          </div>
        )}
      </div>
    </div>
  );
}
