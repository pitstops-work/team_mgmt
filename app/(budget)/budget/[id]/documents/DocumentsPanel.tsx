"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GrantDocumentKind } from "@/app/generated/prisma/client";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LIST,
  DOCUMENT_STAGE_LABELS,
  GRANTEE_UPLOADABLE_KINDS,
  MAX_DOCUMENT_BYTES,
  STAGE_ORDER_FOR_DOCUMENTS,
} from "@/lib/budget/documentKinds";
import { removeGrantDocument } from "./actions";

/**
 * The repository for one grant, grouped by the stage each document belongs to.
 *
 * Grouped by stage rather than by date because the question people actually
 * arrive with is "do we have the signed agreement" or "what did they send for
 * year 1 reporting", never "what came in on Tuesday".
 *
 * The kind picker is filtered by audience from the same table the server
 * enforces, so a grantee is never offered a kind the upload route will refuse.
 * The filter is a courtesy; the route is the check.
 */

type Doc = {
  id: string;
  kind: GrantDocumentKind;
  kindLabel: string;
  title: string;
  href: string;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  supersedesId: string | null;
  isSuperseded: boolean;
  uploadedBy: string | null;
  createdAt: string;
  anchor: string;
};

type Requirement = {
  kind: GrantDocumentKind;
  kindLabel: string;
  timing: string;
  note: string | null;
  held: boolean;
  granteeProvides: boolean;
};

const TIMING_LABELS: Record<string, string> = {
  pre_disbursement: "Before the first release",
  pre_tranche: "Before each release",
  during_grant: "During the grant",
  pre_closure: "Before closure",
};

/**
 * Which timings the release gate actually enforces today. `pre_disbursement`
 * blocks the first tranche; the other three are recorded but nothing reads
 * them. Saying so on the screen is better than letting a tick box imply a
 * control that does not exist.
 */
const ENFORCED_TIMINGS = new Set(["pre_disbursement"]);

const fmtSize = (n: number | null) =>
  n === null ? null : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function DocumentsPanel({
  budgetId,
  budgetName,
  granteeName,
  audience,
  documents,
  requirements,
}: {
  budgetId: string;
  budgetName: string;
  granteeName: string | null;
  audience: "internal" | "partner";
  documents: Doc[];
  requirements: Requirement[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  const internal = audience === "internal";
  const kinds: GrantDocumentKind[] = internal ? DOCUMENT_KIND_LIST : GRANTEE_UPLOADABLE_KINDS;

  const [kind, setKind] = useState<GrantDocumentKind>(kinds[0] ?? "other");
  const [title, setTitle] = useState("");
  const [replaces, setReplaces] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const current = documents.filter((d) => !d.isSuperseded);
  const superseded = documents.filter((d) => d.isSuperseded);

  // Candidates to replace: current documents of the chosen kind. A version
  // chain cannot span two kinds, and the server refuses it, so the list is
  // narrowed rather than letting someone pick an impossible pairing.
  const replaceable = current.filter((d) => d.kind === kind);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    setError(null);
    setNote(null);
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB.`);
      return;
    }

    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    body.set("budgetId", budgetId);
    if (title.trim()) body.set("title", title.trim());
    if (replaces) body.set("supersedesId", replaces);

    setUploading(true);
    try {
      const res = await fetch("/api/grants/documents/upload", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `The upload failed (${res.status}).`);
        return;
      }
      setNote(replaces ? "New version attached." : "Document attached.");
      setTitle("");
      setReplaces("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("The upload could not be sent.");
    } finally {
      setUploading(false);
    }
  }

  function remove(documentId: string) {
    setError(null);
    start(async () => {
      const r = await removeGrantDocument({ budgetId, documentId, reason: removeReason });
      if (!r.ok) setError(r.error);
      else {
        setNote("Document removed.");
        setRemoving(null);
        setRemoveReason("");
        router.refresh();
      }
    });
  }

  const outstanding = requirements.filter((r) => !r.held);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-stone-800">Documents</h2>
        <p className="text-sm text-stone-500">
          {budgetName}
          {granteeName ? ` · ${granteeName}` : ""}
        </p>
        <span className="ml-auto text-xs text-stone-400">
          {current.length} on file
          {superseded.length ? ` · ${superseded.length} superseded` : ""}
        </span>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      {note && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {note}
        </div>
      )}

      {/* ── What is required ────────────────────────────────────────────── */}
      {requirements.length > 0 ? (
        <section className="rounded-lg border border-stone-200 bg-white">
          <div className="flex items-baseline justify-between border-b border-stone-200 px-4 py-2">
            <h3 className="text-sm font-medium text-stone-700">Required</h3>
            <span className="text-xs text-stone-400">
              {outstanding.length ? `${outstanding.length} outstanding` : "all on file"}
            </span>
          </div>
          <ul className="divide-y divide-stone-100">
            {requirements.map((r) => (
              <li key={`${r.kind}-${r.timing}`} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${r.held ? "bg-emerald-500" : "bg-amber-500"}`}
                />
                <span className="text-sm text-stone-700">{r.kindLabel}</span>
                <span className="text-xs text-stone-400">
                  {TIMING_LABELS[r.timing] ?? r.timing.replace(/_/g, " ")}
                  {!ENFORCED_TIMINGS.has(r.timing) && " · recorded, not enforced"}
                </span>
                {r.granteeProvides && (
                  <span className="text-xs text-stone-400">
                    · {internal ? "grantee provides" : "yours to send"}
                  </span>
                )}
                {r.note && <span className="text-xs text-stone-400">· {r.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        internal && (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
            No document requirements are configured, so the release gate never
            blocks on a missing document. Seed them with{" "}
            <code className="text-stone-600">scripts/seed-document-requirements.ts</code>.
          </p>
        )
      )}

      {/* ── Attach ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-medium text-stone-700">Attach a document</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-stone-400">Kind</span>
            <select
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as GrantDocumentKind);
                setReplaces("");
              }}
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {DOCUMENT_KINDS[k].label}
                </option>
              ))}
            </select>
            {DOCUMENT_KINDS[kind]?.hint && (
              <span className="mt-0.5 block text-xs text-stone-400">{DOCUMENT_KINDS[kind].hint}</span>
            )}
          </label>

          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-stone-400">
              Title <span className="normal-case text-stone-300">(optional)</span>
            </span>
            <input
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to the file name"
            />
          </label>

          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-stone-400">File</span>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
              className="mt-1 w-full text-sm text-stone-600"
            />
            <span className="mt-0.5 block text-xs text-stone-400">
              PDF, image, spreadsheet or Word. Up to 25 MB.
            </span>
          </label>

          {replaceable.length > 0 && (
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-stone-400">
                Replace a version
              </span>
              <select
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                value={replaces}
                onChange={(e) => setReplaces(e.target.value)}
              >
                <option value="">Attach as a new document</option>
                {replaceable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} (v{d.version})
                  </option>
                ))}
              </select>
              <span className="mt-0.5 block text-xs text-stone-400">
                The old version stays readable.
              </span>
            </label>
          )}
        </div>

        <button
          type="button"
          disabled={uploading}
          onClick={upload}
          className="mt-4 rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-900 disabled:opacity-40"
        >
          {uploading ? "Uploading…" : replaces ? "Attach new version" : "Attach"}
        </button>
        <p className="mt-2 text-xs text-stone-400">
          Stored privately — readable only by signing in, and every read is recorded.
        </p>
      </section>

      {/* ── On file, by stage ───────────────────────────────────────────── */}
      {STAGE_ORDER_FOR_DOCUMENTS.map((stage) => {
        const inStage = (showSuperseded ? documents : current).filter(
          (d) => DOCUMENT_KINDS[d.kind]?.stage === stage,
        );
        if (!inStage.length) return null;
        return (
          <section key={stage} className="rounded-lg border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-2">
              <h3 className="text-sm font-medium text-stone-700">{DOCUMENT_STAGE_LABELS[stage]}</h3>
            </div>
            <ul className="divide-y divide-stone-100">
              {inStage.map((d) => (
                <li key={d.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <a
                      href={d.href}
                      target="_blank"
                      rel="noreferrer"
                      className={`text-sm ${d.isSuperseded ? "text-stone-400 line-through" : "text-sky-700 hover:underline"}`}
                    >
                      {d.title}
                    </a>
                    <span className="text-xs text-stone-400">
                      {d.kindLabel}
                      {d.version > 1 ? ` · v${d.version}` : ""}
                      {d.isSuperseded ? " · superseded" : ""}
                    </span>
                    <span className="ml-auto text-xs text-stone-400">
                      {fmtDate(d.createdAt)}
                      {d.uploadedBy ? ` · ${d.uploadedBy}` : ""}
                      {fmtSize(d.sizeBytes) ? ` · ${fmtSize(d.sizeBytes)}` : ""}
                    </span>
                  </div>

                  {internal && !d.isSuperseded && !d.supersedesId && (
                    removing === d.id ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="flex-1">
                          <span className="block text-xs uppercase tracking-wide text-stone-400">
                            Why it is being removed
                          </span>
                          <input
                            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
                            value={removeReason}
                            onChange={(e) => setRemoveReason(e.target.value)}
                            placeholder="Wrong file, wrong grant…"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={pending || !removeReason.trim()}
                          onClick={() => remove(d.id)}
                          className="rounded bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800 disabled:opacity-40"
                        >
                          Remove for good
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRemoving(null);
                            setRemoveReason("");
                          }}
                          className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRemoving(d.id)}
                        className="mt-1 text-xs text-stone-400 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {current.length === 0 && (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">
          Nothing on file for this grant yet.
        </p>
      )}

      {superseded.length > 0 && (
        <button
          type="button"
          onClick={() => setShowSuperseded((v) => !v)}
          className="text-xs text-stone-400 hover:text-stone-700"
        >
          {showSuperseded ? "Hide" : "Show"} {superseded.length} superseded version
          {superseded.length === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
