"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, Search, X } from "lucide-react";

type Candidate = { id: string; name: string | null; designation: string | null };

/**
 * Admin-only "View as" control on the Operations home. Opens a searchable list
 * of users; picking one navigates to /operations?asUser=<id> for a read-only
 * preview of that person's centres + driver.
 */
export function ViewAsPicker({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? candidates.filter((c) => (c.name ?? "").toLowerCase().includes(s) || (c.designation ?? "").toLowerCase().includes(s))
      : candidates;
    return list.slice(0, 50);
  }, [q, candidates]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:border-stone-300"
      >
        <Eye className="w-3.5 h-3.5" />
        View as
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-white rounded-xl shadow-lg border border-stone-200 flex flex-col max-h-80">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
            <Search className="w-3.5 h-3.5 text-stone-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="flex-1 text-sm outline-none placeholder:text-stone-300"
            />
            {q && <button onClick={() => setQ("")}><X className="w-3.5 h-3.5 text-stone-300" /></button>}
          </div>
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-stone-400">No matches.</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setOpen(false); router.push(`/operations?asUser=${encodeURIComponent(c.id)}`); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-stone-50"
                >
                  <span className="text-sm text-stone-700 truncate">{c.name ?? "(no name)"}</span>
                  {c.designation && <span className="text-[10px] text-stone-400 flex-shrink-0">{c.designation}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
