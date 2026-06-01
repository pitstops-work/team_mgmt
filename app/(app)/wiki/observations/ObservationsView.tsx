"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, Plus, Filter, Trash2 } from "lucide-react";

type Obs = {
  id: string;
  kind: string;
  vertical: string;
  city: string | null;
  happenedAt: string;
  notes: string;
  openQuestions: string | null;
  driftFlagged: boolean;
  observer: { id: string; name: string | null };
  observed: { id: string; name: string | null } | null;
  partnerOrg: { id: string; name: string } | null;
  primaryPage: { id: string; slug: string; title: string } | null;
};

type Org = { id: string; name: string };
type Page = { id: string; slug: string; title: string; type: string };
type ND = { domain: string; label: string };

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

export default function ObservationsView({
  viewerId,
  viewerIsCurator,
  observations: initial,
  partnerOrgs,
  pageOptions,
  needsDomains,
}: {
  viewerId: string;
  viewerIsCurator: boolean;
  observations: Obs[];
  partnerOrgs: Org[];
  pageOptions: Page[];
  needsDomains: ND[];
}) {
  // Old free-text rows may not match a domain key; fall back to raw value.
  const verticalLabel = new Map(needsDomains.map((d) => [d.domain, d.label]));
  const router = useRouter();
  const [observations, setObservations] = useState<Obs[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  async function archive(o: Obs) {
    if (!confirm("Archive this observation? It will disappear from the list and dashboards.")) return;
    setArchivingId(o.id);
    const res = await fetch(`/api/wiki/observations/${o.id}`, { method: "DELETE" });
    setArchivingId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Archive failed.");
      return;
    }
    setObservations((prev) => prev.filter((x) => x.id !== o.id));
  }

  // Form state
  const [kind, setKind] = useState<"shadow" | "onboarding">("shadow");
  const [vertical, setVertical] = useState("");
  const [happenedAt, setHappenedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [partnerOrgId, setPartnerOrgId] = useState("");
  const [city, setCity] = useState("");
  const [primaryPageId, setPrimaryPageId] = useState("");
  const [notes, setNotes] = useState("");
  const [openQuestions, setOpenQuestions] = useState("");
  const [driftFlagged, setDriftFlagged] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!vertical.trim()) {
      setErr("Vertical is required.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/wiki/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        vertical: vertical.trim(),
        happenedAt: new Date(happenedAt + "T00:00:00").toISOString(),
        partnerOrgId: partnerOrgId || undefined,
        city: city || undefined,
        primaryPageId: primaryPageId || undefined,
        notes,
        openQuestions: openQuestions.trim() || undefined,
        driftFlagged,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Failed to record observation.");
      return;
    }
    setVertical("");
    setNotes("");
    setOpenQuestions("");
    setDriftFlagged(false);
    setPartnerOrgId("");
    setPrimaryPageId("");
    setShowForm(false);
    router.refresh();
  }

  const visible = kindFilter === "all" ? observations : observations.filter((o) => o.kind === kindFilter);
  const myCount = observations.filter((o) => o.observer.id === viewerId).length;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/wiki" className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Wiki
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-stone-900 inline-flex items-center gap-2">
            <Eye className="w-6 h-6 text-stone-600" /> Field observations
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Shadow visits and new-CO onboarding sessions. The two upstream channels that catch what people stop noticing.{" "}
            See <a className="underline" href="/training/modules/practice-documentation/06-field-shadows-onboarding.html">module 6</a> for protocol.
          </p>
          <div className="flex gap-3 mt-4 text-xs text-stone-600">
            <span className="px-3 py-1 rounded-full bg-stone-100 border border-stone-200">
              Total <b className="text-stone-900">{observations.length}</b>
            </span>
            <span className="px-3 py-1 rounded-full bg-violet-50 border border-violet-200">
              Recorded by me <b className="text-stone-900">{myCount}</b>
            </span>
          </div>
        </header>

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-700"
          >
            <Plus className="w-4 h-4" /> {showForm ? "Cancel" : "Record observation"}
          </button>
          <div className="ml-auto inline-flex items-center gap-2 text-sm text-stone-600">
            <Filter className="w-4 h-4" />
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="border border-stone-300 rounded-md text-sm py-1 px-2 bg-white"
            >
              <option value="all">All</option>
              <option value="shadow">Shadow visit</option>
              <option value="onboarding">CO onboarding</option>
            </select>
          </div>
        </div>

        {showForm && (
          <form onSubmit={record} className="mb-6 p-5 bg-white border border-stone-200 rounded-lg">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">Kind *</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "shadow" | "onboarding")}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="shadow">Shadow visit</option>
                  <option value="onboarding">CO onboarding</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">Vertical *</span>
                <select
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">— pick a needs domain —</option>
                  {needsDomains.map((d) => (
                    <option key={d.domain} value={d.domain}>{d.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">When *</span>
                <input
                  type="date"
                  value={happenedAt}
                  onChange={(e) => setHappenedAt(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">Partner</span>
                <select
                  value={partnerOrgId}
                  onChange={(e) => setPartnerOrgId(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">—</option>
                  {partnerOrgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">City</span>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">—</option>
                  <option value="bangalore">Bangalore</option>
                  <option value="chennai">Chennai</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">Primary page touched</span>
                <select
                  value={primaryPageId}
                  onChange={(e) => setPrimaryPageId(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">—</option>
                  {pageOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.type} · {p.title}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-700 font-medium">Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder={
                    kind === "shadow"
                      ? "Playbook says · CO did · why differ. Capture three columns if you can."
                      : "The questions the new CO asked. Their words; capture verbatim where possible."
                  }
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-700 font-medium">Open questions for next circle</span>
                <textarea
                  value={openQuestions}
                  onChange={(e) => setOpenQuestions(e.target.value)}
                  rows={2}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={driftFlagged}
                  onChange={(e) => setDriftFlagged(e.target.checked)}
                  className="rounded border-stone-300"
                />
                <span className="text-stone-700">I am also filing a flag on the page — drift detected.</span>
              </label>
            </div>
            {err && <p className="mt-3 text-sm text-rose-700">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-700 disabled:opacity-50"
              >
                {busy ? "Recording…" : "Record"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-white border border-stone-300 text-sm text-stone-700 rounded-md"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <ul className="space-y-3">
          {visible.length === 0 && (
            <li className="text-sm text-stone-500 italic p-4 bg-white border border-stone-200 rounded-lg">
              No observations yet.
            </li>
          )}
          {visible.map((o) => {
            const canArchive = viewerIsCurator || o.observer.id === viewerId;
            return (
            <li key={o.id} className="p-4 bg-white border border-stone-200 rounded-lg">
              <div className="flex items-start gap-3">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${
                    o.kind === "shadow"
                      ? "bg-violet-100 text-violet-900 border-violet-300"
                      : "bg-emerald-100 text-emerald-900 border-emerald-300"
                  }`}
                >
                  {o.kind}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-stone-500">
                    <span><b className="text-stone-700">{verticalLabel.get(o.vertical) ?? o.vertical}</b></span>
                    {o.city && <span>· {o.city}</span>}
                    {o.partnerOrg && <span>· {o.partnerOrg.name}</span>}
                    <span>· {fmt(o.happenedAt)}</span>
                    <span>· by {o.observer.name || "—"}</span>
                    {o.observed && <span>· of {o.observed.name || "—"}</span>}
                    {o.driftFlagged && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">drift</span>
                    )}
                  </div>
                  {o.primaryPage && (
                    <p className="mt-1 text-xs text-stone-600">
                      → <Link href={`/wiki/${o.primaryPage.slug}`} className="underline">{o.primaryPage.title}</Link>
                    </p>
                  )}
                  {o.notes && <p className="mt-1 text-sm text-stone-800 whitespace-pre-wrap">{o.notes}</p>}
                  {o.openQuestions && (
                    <p className="mt-1 text-xs text-stone-600 italic">Open: {o.openQuestions}</p>
                  )}
                </div>
                {canArchive && (
                  <button
                    type="button"
                    disabled={archivingId === o.id}
                    onClick={() => archive(o)}
                    className="shrink-0 p-1.5 text-stone-400 hover:text-red-600 rounded disabled:opacity-50"
                    title={viewerIsCurator ? "Archive observation (curator)" : "Archive observation (observer)"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
