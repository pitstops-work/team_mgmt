"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Pencil, Trash2, Check, X, Cloud, RefreshCw, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Provider {
  id: string;
  key: string;
  label: string;
  baseUrl: string;
  authType: string;
  hasCredentials: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  notes: string | null;
}

type AuthType = "frappe" | "api_key" | "basic" | "bearer";

type EditState = {
  id?: string;
  key: string;
  label: string;
  baseUrl: string;
  authType: AuthType;
  // Credentials shape depends on authType. We keep generic record + show relevant fields.
  credentials: Record<string, string>;
  credentialsChanged: boolean;
  notes: string;
  isActive: boolean;
} | null;

const inputCls = "px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white";
const labelCls = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-0.5";

const emptyDraft = (): NonNullable<EditState> => ({
  key: "",
  label: "",
  baseUrl: "",
  authType: "frappe",
  credentials: {},
  credentialsChanged: false,
  notes: "",
  isActive: true,
});

export default function MISProvidersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super-admin";

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/mis-providers");
    if (res.ok) setProviders(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session && !isAdmin) router.replace("/settings");
  }, [session, isAdmin, router]);

  useEffect(() => { load(); }, [load]);

  if (!isAdmin) return null;

  const handleSave = async () => {
    if (!edit) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        key: edit.key,
        label: edit.label,
        baseUrl: edit.baseUrl,
        authType: edit.authType,
        notes: edit.notes || null,
        isActive: edit.isActive,
      };
      // Only send credentials if changed (otherwise keep existing on the server)
      if (edit.credentialsChanged) body.credentials = edit.credentials;

      const res = edit.id
        ? await fetch(`/api/admin/mis-providers/${edit.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/admin/mis-providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, credentials: edit.credentials }),
          });
      if (res.ok) {
        setEdit(null);
        load();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete provider "${label}"? Any indicators referencing it will lose their MIS source.`)) return;
    await fetch(`/api/admin/mis-providers/${id}`, { method: "DELETE" });
    load();
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    setSyncResult(r => ({ ...r, [id]: { ok: false, message: "" } }));
    try {
      const res = await fetch(`/api/admin/mis-providers/${id}/sync`, { method: "POST" });
      const data = await res.json();
      setSyncResult(r => ({ ...r, [id]: { ok: res.ok, message: data.message ?? data.error ?? "Done" } }));
      load();
    } catch (e) {
      setSyncResult(r => ({ ...r, [id]: { ok: false, message: e instanceof Error ? e.message : "Network error" } }));
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/settings" className="text-stone-400 hover:text-stone-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">MIS Providers</h1>
      </div>

      <p className="text-sm text-stone-500 mb-6 leading-relaxed">
        External MIS systems Pitstops pulls indicator data from (e.g. Frappe Creche MIS).
        Indicators with capture source <strong>MIS API</strong> reference these providers.
        Credentials are stored in the database and only accessible to admins.
      </p>

      {loading ? (
        <p className="text-sm text-stone-400 text-center py-8">Loading…</p>
      ) : (
        <div className="space-y-2 mb-4">
          {providers.map(p => (
            <div key={p.id}>
              {edit?.id === p.id ? (
                <ProviderForm
                  draft={edit}
                  setDraft={setEdit}
                  onSave={handleSave}
                  onCancel={() => { setEdit(null); setError(""); }}
                  saving={saving}
                  error={error}
                />
              ) : (
                <div className={`bg-white border border-stone-200 rounded-xl p-3 ${!p.isActive ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <Cloud className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-stone-800">{p.label}</span>
                        <code className="text-[10px] font-mono text-stone-400">{p.key}</code>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">{p.authType}</span>
                        {p.hasCredentials ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                            <KeyRound className="w-2.5 h-2.5" /> creds set
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                            <AlertCircle className="w-2.5 h-2.5" /> no creds
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500 mt-0.5 truncate">{p.baseUrl}</p>
                      {p.lastSyncedAt && (
                        <p className="text-[10px] text-stone-400 mt-1">
                          Last sync: {new Date(p.lastSyncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                          {p.lastSyncStatus && (
                            <span className={p.lastSyncStatus === "ok" ? " text-emerald-500 ml-1" : " text-red-500 ml-1"}>
                              {p.lastSyncStatus === "ok" ? "✓" : `· ${p.lastSyncStatus}`}
                            </span>
                          )}
                        </p>
                      )}
                      {syncResult[p.id] && syncResult[p.id].message && (
                        <p className={`text-[11px] mt-1 ${syncResult[p.id].ok ? "text-emerald-600" : "text-red-500"}`}>
                          {syncResult[p.id].ok ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <AlertCircle className="w-3 h-3 inline mr-1" />}
                          {syncResult[p.id].message}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleSync(p.id)}
                        disabled={syncing === p.id || !p.hasCredentials}
                        title={p.hasCredentials ? "Run sync now" : "Add credentials first"}
                        className="p-1.5 hover:bg-sky-50 rounded text-stone-400 hover:text-sky-600 transition-colors disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing === p.id ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => setEdit({
                          id: p.id,
                          key: p.key,
                          label: p.label,
                          baseUrl: p.baseUrl,
                          authType: p.authType as AuthType,
                          credentials: {},
                          credentialsChanged: false,
                          notes: p.notes ?? "",
                          isActive: p.isActive,
                        })}
                        className="p-1.5 hover:bg-stone-50 rounded text-stone-400 hover:text-stone-600 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.label)}
                        className="p-1.5 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {providers.length === 0 && !edit && (
            <p className="text-sm text-stone-400 italic text-center py-8">No MIS providers yet.</p>
          )}
        </div>
      )}

      {edit && !edit.id ? (
        <ProviderForm
          draft={edit}
          setDraft={setEdit}
          onSave={handleSave}
          onCancel={() => { setEdit(null); setError(""); }}
          saving={saving}
          error={error}
          isNew
        />
      ) : (
        <button
          onClick={() => setEdit(emptyDraft())}
          className="flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add MIS provider
        </button>
      )}
    </div>
  );
}

function ProviderForm({
  draft, setDraft, onSave, onCancel, saving, error, isNew = false,
}: {
  draft: NonNullable<EditState>;
  setDraft: (d: EditState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
  isNew?: boolean;
}) {
  const setCred = (field: string, value: string) => {
    setDraft({ ...draft, credentials: { ...draft.credentials, [field]: value }, credentialsChanged: true });
  };

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${isNew ? "bg-sky-50 border-sky-200" : "bg-stone-50 border-stone-200"}`}>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className={labelCls}>Label</label>
          <input
            autoFocus
            className={inputCls + " w-full"}
            value={draft.label}
            onChange={e => setDraft({ ...draft, label: e.target.value })}
            placeholder="e.g. Frappe Creche MIS"
          />
        </div>
        <div className="w-56">
          <label className={labelCls}>Key</label>
          <input
            className={inputCls + " w-full font-mono text-xs"}
            value={draft.key}
            onChange={e => setDraft({ ...draft, key: e.target.value.replace(/[^a-z0-9_-]/g, "-").toLowerCase() })}
            placeholder="frappe-creche-mis"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Base URL</label>
        <input
          className={inputCls + " w-full font-mono text-xs"}
          value={draft.baseUrl}
          onChange={e => setDraft({ ...draft, baseUrl: e.target.value })}
          placeholder="https://crechemis.example.org"
        />
      </div>

      <div>
        <label className={labelCls}>Auth Type</label>
        <div className="flex flex-wrap gap-1.5">
          {(["frappe", "api_key", "basic", "bearer"] as AuthType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setDraft({ ...draft, authType: t, credentials: {}, credentialsChanged: true })}
              className={`px-2.5 py-1 text-xs rounded-full border ${draft.authType === t ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}
            >
              {t === "frappe" ? "Frappe (key + secret)" : t === "api_key" ? "API Key" : t === "basic" ? "Basic Auth" : "Bearer Token"}
            </button>
          ))}
        </div>
      </div>

      {/* Credentials block — fields depend on authType */}
      <div className="border border-stone-200 rounded-lg p-3 bg-white space-y-2">
        <label className={labelCls}>Credentials {!isNew && "(leave blank to keep existing)"}</label>
        {draft.authType === "frappe" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>API Key</label>
              <input
                type="text"
                className={inputCls + " w-full font-mono text-xs"}
                value={draft.credentials.apiKey ?? ""}
                onChange={e => setCred("apiKey", e.target.value)}
                placeholder={isNew ? "frappe api_key" : "•••••• (unchanged)"}
              />
            </div>
            <div>
              <label className={labelCls}>API Secret</label>
              <input
                type="password"
                className={inputCls + " w-full font-mono text-xs"}
                value={draft.credentials.apiSecret ?? ""}
                onChange={e => setCred("apiSecret", e.target.value)}
                placeholder={isNew ? "frappe api_secret" : "•••••• (unchanged)"}
              />
            </div>
          </div>
        )}
        {draft.authType === "api_key" && (
          <div>
            <label className={labelCls}>API Key</label>
            <input
              type="password"
              className={inputCls + " w-full font-mono text-xs"}
              value={draft.credentials.apiKey ?? ""}
              onChange={e => setCred("apiKey", e.target.value)}
              placeholder={isNew ? "api key value" : "•••••• (unchanged)"}
            />
          </div>
        )}
        {draft.authType === "basic" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Username</label>
              <input
                type="text"
                className={inputCls + " w-full"}
                value={draft.credentials.user ?? ""}
                onChange={e => setCred("user", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input
                type="password"
                className={inputCls + " w-full"}
                value={draft.credentials.pass ?? ""}
                onChange={e => setCred("pass", e.target.value)}
              />
            </div>
          </div>
        )}
        {draft.authType === "bearer" && (
          <div>
            <label className={labelCls}>Bearer Token</label>
            <input
              type="password"
              className={inputCls + " w-full font-mono text-xs"}
              value={draft.credentials.token ?? ""}
              onChange={e => setCred("token", e.target.value)}
            />
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Notes (optional)</label>
        <textarea
          className={inputCls + " w-full"}
          rows={2}
          value={draft.notes}
          onChange={e => setDraft({ ...draft, notes: e.target.value })}
          placeholder="e.g. contact for API issues, settlement-code mapping notes"
        />
      </div>

      <div className="flex justify-between items-center pt-1">
        <label className="flex items-center gap-1.5 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={e => setDraft({ ...draft, isActive: e.target.checked })}
          />
          Active
        </label>
        <div className="flex gap-2 items-center">
          {error && <span className="text-xs text-red-500">{error}</span>}
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg text-stone-500 hover:bg-stone-100">
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSave}
            disabled={saving || !draft.label || !draft.key || !draft.baseUrl}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
