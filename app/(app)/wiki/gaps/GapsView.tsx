"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Inbox, ListFilter } from "lucide-react";

type Gap = {
  id: string;
  vertical: string;
  oneLineNeed: string;
  suggestedTitle: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  triagedAt: string | null;
  draftingDeadline: string | null;
  declineReason: string | null;
  filer: { id: string; name: string | null };
  assignedOwner: { id: string; name: string | null } | null;
  partnerOrg: { id: string; name: string; slug: string } | null;
  linkedPage: { id: string; slug: string; title: string } | null;
};

type Org = { id: string; name: string; slug: string };
type Owner = { id: string; name: string | null; email: string | null };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_COLOURS: Record<string, string> = {
  open: "bg-amber-100 text-amber-900 border-amber-300",
  assigned: "bg-sky-100 text-sky-900 border-sky-300",
  drafted: "bg-violet-100 text-violet-900 border-violet-300",
  merged: "bg-stone-200 text-stone-700 border-stone-300",
  published: "bg-emerald-100 text-emerald-900 border-emerald-300",
  declined: "bg-rose-100 text-rose-900 border-rose-300",
};

export default function GapsView({
  viewerIsCurator,
  viewerId,
  gaps: initialGaps,
  partnerOrgs,
  candidateOwners,
}: {
  viewerIsCurator: boolean;
  viewerId: string;
  gaps: Gap[];
  partnerOrgs: Org[];
  candidateOwners: Owner[];
}) {
  const router = useRouter();
  const [gaps, setGaps] = useState<Gap[]>(initialGaps);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  // File form state
  const [vertical, setVertical] = useState("");
  const [oneLineNeed, setOneLineNeed] = useState("");
  const [suggestedTitle, setSuggestedTitle] = useState("");
  const [city, setCity] = useState<string>("");
  const [partnerOrgId, setPartnerOrgId] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function fileGap(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!vertical.trim()) {
      setSubmitError("Vertical is required.");
      return;
    }
    if (oneLineNeed.trim().length < 10) {
      setSubmitError("Describe the gap in at least 10 characters.");
      return;
    }
    setBusy("file");
    const res = await fetch("/api/wiki/gaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vertical: vertical.trim(),
        oneLineNeed: oneLineNeed.trim(),
        suggestedTitle: suggestedTitle.trim() || undefined,
        city: city || undefined,
        partnerOrgId: partnerOrgId || undefined,
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSubmitError(j.error || "Failed to file gap.");
      return;
    }
    setVertical("");
    setOneLineNeed("");
    setSuggestedTitle("");
    setCity("");
    setPartnerOrgId("");
    setShowForm(false);
    router.refresh();
  }

  async function triage(id: string, body: Record<string, unknown>) {
    setBusy(id);
    const res = await fetch(`/api/wiki/gaps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Triage failed.");
      return;
    }
    router.refresh();
  }

  const visible = statusFilter === "all" ? gaps : gaps.filter((g) => g.status === statusFilter);
  const queueDepth = gaps.filter((g) => g.status === "open").length;
  const myAssigned = gaps.filter((g) => g.assignedOwner?.id === viewerId && g.status !== "published" && g.status !== "declined").length;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/wiki" className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Wiki
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-stone-900 inline-flex items-center gap-2">
            <Inbox className="w-6 h-6 text-stone-600" /> Practice gap queue
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            One-line "there is no page for this" notes from the field. Curator's weekly walk triages: assign to draft, merge into an existing page, or decline. See <a className="underline" href="/training/modules/practice-documentation/05-practice-gap-queue.html">module 5</a>.
          </p>
          {viewerIsCurator && (
            <div className="flex gap-3 mt-4 text-xs text-stone-600">
              <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200">
                Queue depth <b className="text-stone-900">{queueDepth}</b>
              </span>
              <span className="px-3 py-1 rounded-full bg-sky-50 border border-sky-200">
                Assigned to me <b className="text-stone-900">{myAssigned}</b>
              </span>
            </div>
          )}
        </header>

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-700"
          >
            <Plus className="w-4 h-4" /> {showForm ? "Cancel" : "File a gap"}
          </button>
          <div className="ml-auto inline-flex items-center gap-2 text-sm text-stone-600">
            <ListFilter className="w-4 h-4" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-stone-300 rounded-md text-sm py-1 px-2 bg-white"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="drafted">Drafted</option>
              <option value="merged">Merged</option>
              <option value="published">Published</option>
              <option value="declined">Declined</option>
            </select>
          </div>
        </div>

        {showForm && (
          <form onSubmit={fileGap} className="mb-6 p-5 bg-white border border-stone-200 rounded-lg">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">Vertical *</span>
                <input
                  type="text"
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                  placeholder="e.g. creche, welfare-rights, food"
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">City</span>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">— universal —</option>
                  <option value="bangalore">Bangalore</option>
                  <option value="chennai">Chennai</option>
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-700 font-medium">The gap, in one sentence *</span>
                <textarea
                  value={oneLineNeed}
                  onChange={(e) => setOneLineNeed(e.target.value)}
                  placeholder="No page for what to do when a household's eldest is on a ventilator and cannot come to the centre."
                  rows={2}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                  maxLength={600}
                />
                <span className="text-xs text-stone-500">{oneLineNeed.length} / 600</span>
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">Suggested title <span className="text-stone-400">(optional)</span></span>
                <input
                  type="text"
                  value={suggestedTitle}
                  onChange={(e) => setSuggestedTitle(e.target.value)}
                  placeholder="Owner may rename."
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">Partner <span className="text-stone-400">(optional)</span></span>
                <select
                  value={partnerOrgId}
                  onChange={(e) => setPartnerOrgId(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">— universal —</option>
                  {partnerOrgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {submitError && <p className="mt-3 text-sm text-rose-700">{submitError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={busy === "file"}
                className="px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-700 disabled:opacity-50"
              >
                {busy === "file" ? "Filing…" : "File gap"}
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
              {statusFilter === "all" ? "No gaps yet." : `No ${statusFilter} gaps.`}
            </li>
          )}
          {visible.map((g) => (
            <li key={g.id} className="p-4 bg-white border border-stone-200 rounded-lg">
              <div className="flex items-start gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${STATUS_COLOURS[g.status] || "bg-stone-100 text-stone-700 border-stone-300"}`}>
                  {g.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-stone-500">
                    <span><b className="text-stone-700">{g.vertical}</b></span>
                    {g.city && <span>· {g.city}</span>}
                    {g.partnerOrg && <span>· {g.partnerOrg.name}</span>}
                    <span>· filed {fmtDate(g.createdAt)} by {g.filer.name || "—"}</span>
                    {g.assignedOwner && <span>· owner {g.assignedOwner.name || "—"}</span>}
                    {g.draftingDeadline && <span>· deadline {fmtDate(g.draftingDeadline)}</span>}
                  </div>
                  <p className="mt-1 text-sm text-stone-800">{g.oneLineNeed}</p>
                  {g.suggestedTitle && <p className="mt-1 text-xs text-stone-500 italic">suggested: {g.suggestedTitle}</p>}
                  {g.linkedPage && (
                    <p className="mt-1 text-xs text-emerald-700">
                      → <Link href={`/wiki/${g.linkedPage.slug}`} className="underline">{g.linkedPage.title}</Link>
                    </p>
                  )}
                  {g.declineReason && <p className="mt-1 text-xs text-rose-700">declined: {g.declineReason}</p>}

                  {viewerIsCurator && g.status === "open" && (
                    <TriageControls
                      gap={g}
                      candidateOwners={candidateOwners}
                      busy={busy === g.id}
                      onTriage={(body) => triage(g.id, body)}
                    />
                  )}

                  {(viewerIsCurator || g.assignedOwner?.id === viewerId) && g.status === "assigned" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={busy === g.id}
                        onClick={() => triage(g.id, { action: "draft" })}
                        className="px-3 py-1 bg-violet-100 border border-violet-300 text-violet-900 text-xs rounded-md hover:bg-violet-200"
                      >
                        Mark drafted
                      </button>
                    </div>
                  )}

                  {(viewerIsCurator || g.assignedOwner?.id === viewerId) &&
                    (g.status === "assigned" || g.status === "drafted") && (
                      <PublishControls busy={busy === g.id} onPublish={(slug) => triage(g.id, { action: "publish", linkedPageId: slug })} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function TriageControls({
  gap,
  candidateOwners,
  busy,
  onTriage,
}: {
  gap: Gap;
  candidateOwners: Owner[];
  busy: boolean;
  onTriage: (body: Record<string, unknown>) => void;
}) {
  const [ownerId, setOwnerId] = useState("");
  const [mergePageId, setMergePageId] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  return (
    <div className="mt-3 grid sm:grid-cols-3 gap-2 text-xs">
      <div className="p-2 bg-sky-50 border border-sky-200 rounded">
        <div className="font-medium text-sky-900 mb-1">Assign to owner</div>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="w-full border border-sky-300 rounded px-2 py-1 bg-white"
        >
          <option value="">— pick —</option>
          {candidateOwners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name || o.email || "—"}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !ownerId}
          onClick={() => onTriage({ action: "assign", ownerId })}
          className="mt-1 w-full px-2 py-1 bg-sky-900 text-white rounded disabled:opacity-50"
        >
          Assign
        </button>
      </div>
      <div className="p-2 bg-stone-100 border border-stone-300 rounded">
        <div className="font-medium text-stone-900 mb-1">Merge into page id</div>
        <input
          type="text"
          value={mergePageId}
          onChange={(e) => setMergePageId(e.target.value)}
          placeholder="wikiPage.id"
          className="w-full border border-stone-300 rounded px-2 py-1"
        />
        <button
          disabled={busy || !mergePageId}
          onClick={() => onTriage({ action: "merge", linkedPageId: mergePageId })}
          className="mt-1 w-full px-2 py-1 bg-stone-900 text-white rounded disabled:opacity-50"
        >
          Merge
        </button>
      </div>
      <div className="p-2 bg-rose-50 border border-rose-200 rounded">
        <div className="font-medium text-rose-900 mb-1">Decline (reason)</div>
        <input
          type="text"
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
          placeholder="why declined"
          className="w-full border border-rose-300 rounded px-2 py-1"
        />
        <button
          disabled={busy || declineReason.length < 5}
          onClick={() => onTriage({ action: "decline", declineReason })}
          className="mt-1 w-full px-2 py-1 bg-rose-900 text-white rounded disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function PublishControls({ busy, onPublish }: { busy: boolean; onPublish: (id: string) => void }) {
  const [pageId, setPageId] = useState("");
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        value={pageId}
        onChange={(e) => setPageId(e.target.value)}
        placeholder="published page id"
        className="border border-stone-300 rounded text-xs px-2 py-1 flex-1 max-w-xs"
      />
      <button
        disabled={busy || !pageId}
        onClick={() => onPublish(pageId)}
        className="px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs rounded-md hover:bg-emerald-200 disabled:opacity-50"
      >
        Mark published → page
      </button>
    </div>
  );
}
