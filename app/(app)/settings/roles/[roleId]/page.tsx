"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, RotateCcw, Save } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

type PermissionRow = {
  permissionId: string;
  resource: string;
  action: string;
  granted: boolean;
  scopeRule: { kind: string; surfaces?: string[] } | null;
};

type ResourceGroup = {
  resource: string;
  permissions: PermissionRow[];
};

type SurfaceDef = {
  id: string;
  label: string;
  group?: string;
  description?: string;
};

type RoleDetail = {
  role: { id: string; name: string; description: string | null; isSystem: boolean };
  groups: ResourceGroup[];
  scopeKinds: string[];
  scopeLabels: Record<string, string>;
  surfaces: SurfaceDef[];
};

type DraftRow = { granted: boolean; kind: string; surfaces: string[] };
type Draft = Record<string, DraftRow>; // keyed by permissionId

const ROLE_STYLE: Record<string, string> = {
  "super-admin":  "bg-amber-100 text-amber-700",
  admin:          "bg-indigo-100 text-indigo-700",
  member:         "bg-emerald-100 text-emerald-700",
  viewer:         "bg-stone-100 text-stone-500",
  "budget-admin": "bg-sky-100 text-sky-700",
};

const DEFAULT_KIND = "all";

export default function RoleDetailPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const isSuperAdmin = session?.user?.role === "super-admin";

  const [detail, setDetail] = useState<RoleDetail | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function buildDraft(d: RoleDetail): Draft {
    const out: Draft = {};
    for (const g of d.groups) {
      for (const p of g.permissions) {
        out[p.permissionId] = {
          granted: p.granted,
          kind: p.scopeRule?.kind ?? DEFAULT_KIND,
          surfaces: p.scopeRule?.surfaces ?? [],
        };
      }
    }
    return out;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rbac/roles/${roleId}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: RoleDetail = await res.json();
      setDetail(data);
      setDraft(buildDraft(data));
    } catch {
      setError("Failed to load role");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (!isSuperAdmin) { router.replace("/settings"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isSuperAdmin, roleId]);

  const dirty = useMemo(() => {
    if (!detail) return false;
    for (const g of detail.groups) {
      for (const p of g.permissions) {
        const d = draft[p.permissionId];
        const wasKind = p.scopeRule?.kind ?? DEFAULT_KIND;
        const wasSurfaces = p.scopeRule?.surfaces ?? [];
        if (d.granted !== p.granted) return true;
        if (d.granted && d.kind !== wasKind) return true;
        if (d.granted && !sameStringSet(d.surfaces, wasSurfaces)) return true;
      }
    }
    return false;
  }, [detail, draft]);

  async function handleSave() {
    if (!detail) return;
    const updates: Array<{
      permissionId: string;
      granted: boolean;
      scopeRule?: { kind: string; surfaces?: string[] };
    }> = [];
    for (const g of detail.groups) {
      for (const p of g.permissions) {
        const d = draft[p.permissionId];
        const wasKind = p.scopeRule?.kind ?? DEFAULT_KIND;
        const wasSurfaces = p.scopeRule?.surfaces ?? [];
        const changed =
          d.granted !== p.granted ||
          (d.granted && d.kind !== wasKind) ||
          (d.granted && !sameStringSet(d.surfaces, wasSurfaces));
        if (!changed) continue;
        updates.push({
          permissionId: p.permissionId,
          granted: d.granted,
          ...(d.granted
            ? {
                scopeRule: {
                  kind: d.kind,
                  ...(d.surfaces.length > 0 ? { surfaces: d.surfaces } : {}),
                },
              }
            : {}),
        });
      }
    }
    if (updates.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rbac/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `${res.status}`);
      }
      setSavedAt(Date.now());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset all permissions for this role to seed defaults? Any custom changes will be lost.")) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rbac/roles/${roleId}/reset`, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      await load();
      setSavedAt(Date.now());
    } catch {
      setError("Reset failed");
    } finally {
      setResetting(false);
    }
  }

  if (status === "loading" || !isSuperAdmin) return null;
  if (loading) return <p className="p-6 text-sm text-stone-400">Loading…</p>;
  if (!detail) return <p className="p-6 text-sm text-red-500">{error ?? "Not found"}</p>;

  return (
    <SurfaceProvider id="settings.role_detail">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/settings/roles"
        className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Roles
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-xl font-semibold text-stone-900">{detail.role.name}</h1>
        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${ROLE_STYLE[detail.role.name] ?? "bg-stone-100 text-stone-600"}`}>
          {detail.role.name}
        </span>
        {detail.role.isSystem && (
          <span className="text-[10px] uppercase tracking-wide text-stone-400">system</span>
        )}
      </div>
      {detail.role.description && (
        <p className="text-sm text-stone-500 mb-6">{detail.role.description}</p>
      )}

      {detail.role.name === "budget-admin" && (
        <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800 leading-relaxed">
          This role also unlocks the <span className="font-medium">Budget</span> and{" "}
          <span className="font-medium">Seeding</span> portals — access controlled in code, not by the permissions
          below. A person&apos;s working role inside Seeding is set in <span className="font-medium">Seeding → Members</span>.
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-stone-50/95 backdrop-blur border-b border-stone-200 flex items-center gap-3 mb-6">
        <button
          onClick={handleReset}
          disabled={resetting || saving}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-stone-200 rounded-lg hover:bg-white disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          {resetting ? "Resetting…" : "Reset to defaults"}
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || saving || resetting}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-stone-900 text-white rounded-lg hover:bg-stone-700 disabled:opacity-40"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
        {savedAt && !dirty && !saving && (
          <span className="text-xs text-emerald-600">Saved</span>
        )}
        {error && <span className="text-xs text-red-500 ml-auto truncate max-w-[40%]">{error}</span>}
      </div>

      <div className="space-y-6">
        {detail.groups.map((group) => (
          <section key={group.resource}>
            <h2 className="text-sm font-semibold text-stone-700 mb-2">{group.resource}</h2>
            <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
              {group.permissions.map((p) => {
                const d = draft[p.permissionId];
                if (!d) return null;
                return (
                  <div
                    key={p.permissionId}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <label className="flex items-center gap-2 min-w-[200px]">
                      <input
                        type="checkbox"
                        checked={d.granted}
                        onChange={(e) => setDraft((prev) => ({
                          ...prev,
                          [p.permissionId]: { ...prev[p.permissionId], granted: e.target.checked },
                        }))}
                        className="rounded border-stone-300"
                      />
                      <span className="font-mono text-xs text-stone-700">{p.action}</span>
                    </label>
                    <select
                      value={d.kind}
                      onChange={(e) => setDraft((prev) => ({
                        ...prev,
                        [p.permissionId]: { ...prev[p.permissionId], kind: e.target.value },
                      }))}
                      disabled={!d.granted}
                      className="flex-1 min-w-[180px] max-w-xs px-2 py-1.5 text-xs border border-stone-200 rounded-md bg-white disabled:bg-stone-50 disabled:text-stone-300"
                    >
                      {detail.scopeKinds.map((k) => (
                        <option key={k} value={k}>{detail.scopeLabels[k] ?? k}</option>
                      ))}
                    </select>
                    <SurfacesPicker
                      value={d.surfaces}
                      allSurfaces={detail.surfaces}
                      disabled={!d.granted}
                      onChange={(next) => setDraft((prev) => ({
                        ...prev,
                        [p.permissionId]: { ...prev[p.permissionId], surfaces: next },
                      }))}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
    </SurfaceProvider>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

// ── Surfaces picker ─────────────────────────────────────────────────────────

function SurfacesPicker({
  value,
  allSurfaces,
  disabled,
  onChange,
}: {
  value: string[];
  allSurfaces: SurfaceDef[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<string, SurfaceDef[]>();
    for (const s of allSurfaces) {
      const g = s.group ?? s.id.split(".")[0];
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return [...map.entries()];
  }, [allSurfaces]);

  const selected = new Set(value);
  const label =
    value.length === 0
      ? "All surfaces"
      : value.length === 1
        ? (allSurfaces.find((s) => s.id === value[0])?.label ?? value[0])
        : `${value.length} surfaces`;

  function toggle(id: string) {
    if (selected.has(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 px-2 py-1.5 text-xs border rounded-md transition-colors ${
          disabled
            ? "bg-stone-50 text-stone-300 border-stone-200 cursor-not-allowed"
            : value.length === 0
              ? "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
              : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
        }`}
        title={value.length === 0 ? "No surface restriction (allowed from anywhere)" : "Restricted to specific surfaces"}
      >
        {label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 max-h-96 overflow-y-auto bg-white border border-stone-200 rounded-lg shadow-lg p-2">
          <div className="px-2 py-1.5 flex items-center justify-between border-b border-stone-100">
            <span className="text-[11px] uppercase tracking-wide text-stone-500">Restrict to surfaces</span>
            {value.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="text-[11px] text-sky-600 hover:underline"
              >
                Clear (allow all)
              </button>
            )}
          </div>
          {grouped.map(([group, surfaces]) => (
            <div key={group} className="pt-2">
              <div className="px-2 text-[10px] uppercase tracking-wide text-stone-400 mb-1">{group}</div>
              {surfaces.map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-2 px-2 py-1 rounded hover:bg-stone-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="mt-0.5 rounded border-stone-300"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs text-stone-700">{s.label}</span>
                    {s.description && (
                      <span className="block text-[10px] text-stone-400">{s.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
