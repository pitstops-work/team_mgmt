"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, Plus, Layers, Eye, EyeOff, Pencil } from "lucide-react";
import type { DbTemplate } from "@/lib/templateDb";

const CATEGORY_ORDER = ["Community Programs", "Programmes", "Field Programmes", "Zonal Leadership"];

export default function TemplatesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super-admin" || session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  const [templates, setTemplates] = useState<DbTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/templates");
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (session && !isAdmin) router.replace("/settings");
  }, [session, isAdmin, router]);

  if (!isAdmin) return null;

  const visible = showInactive ? templates : templates.filter((t) => t.isActive);
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: visible.filter((t) => t.category === cat),
  })).filter((g) => g.items.length > 0);

  // Uncategorized
  const knownCats = new Set(CATEGORY_ORDER);
  const other = visible.filter((t) => !knownCats.has(t.category));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/settings" className="text-stone-400 hover:text-stone-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-stone-900">Goal Templates</h1>
          <p className="text-xs text-stone-500 mt-0.5">Edit pitstops, checklists, SLAs, and parameters for each template.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors text-stone-500"
            title={showInactive ? "Hide inactive" : "Show inactive"}
          >
            {showInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {showInactive ? "Showing all" : "Active only"}
          </button>
          <Link
            href="/settings/templates/new"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </Link>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-stone-400 text-center py-16">Loading…</div>
      )}

      {!loading && visible.length === 0 && (
        <div className="text-center py-16">
          <Layers className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-400">No templates yet.</p>
          <p className="text-xs text-stone-400 mt-1">Run the seed script to import existing templates, or create one manually.</p>
        </div>
      )}

      {[...byCategory, ...(other.length > 0 ? [{ cat: "Other", items: other }] : [])].map(({ cat, items }) => (
        <section key={cat} className="mb-8">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">{cat}</h2>
          <div className="space-y-2">
            {items.map((t) => (
              <Link
                key={t.id}
                href={`/settings/templates/${t.id}`}
                className={`flex items-center gap-3 px-4 py-3 border rounded-xl transition-colors ${
                  t.isActive
                    ? "bg-white border-stone-200 hover:bg-stone-50 hover:border-stone-300"
                    : "bg-stone-50 border-stone-200 opacity-60 hover:opacity-80"
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-stone-800 truncate">{t.name}</p>
                    {!t.isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-stone-200 text-stone-500 rounded-full shrink-0">inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {(t.pitstops as unknown[]).length} pitstops · {(t.parameters as unknown[]).length} params
                  </p>
                </div>
                <Pencil className="w-3.5 h-3.5 text-stone-300 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-stone-400 text-center mt-8">
        Changes take effect immediately for any new goal created from a template.
      </p>
    </div>
  );
}
