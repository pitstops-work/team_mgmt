"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Artifact = {
  id: string;
  kind: string;
  name: string;
  url: string;
  size: number | null;
  caption: string | null;
  stepId: string | null;
  uploadedBy: string | null;
  createdAt: string;
};

type StepRef = { id: string; stepNo: number; title: string; requiredArtifactType: string | null };

const KIND_LABEL: Record<string, string> = {
  survey_drawing: "Survey drawing",
  photo: "Photo",
  map: "Map",
  architect_design: "Architect design",
  vendor_quote: "Vendor quote",
  budget_working: "Budget working",
  permission_letter: "Permission letter",
  partner_agreement: "Partner agreement",
  other: "Other",
};

export default function ArtifactsClient({
  planId, canEdit, kinds, steps, artifacts,
}: {
  planId: string;
  canEdit: boolean;
  kinds: string[];
  steps: StepRef[];
  artifacts: Artifact[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState("photo");
  const [stepId, setStepId] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true); setError(null);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("planId", planId);
      fd.append("kind", kind);
      if (stepId) fd.append("stepId", stepId);
      if (caption) fd.append("caption", caption);
      try {
        const res = await fetch("/api/upload/school", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: `${res.status}` }));
          throw new Error(j.error ?? `${res.status}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setBusy(false);
    startTransition(() => router.refresh());
  }

  const byKind = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    (byKind.get(a.kind) ?? byKind.set(a.kind, []).get(a.kind)!).push(a);
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="block">
              <span className="block text-[10px] font-medium text-stone-500 mb-1">Kind</span>
              <select className="w-full rounded-lg border border-stone-300 px-2 py-1.5" value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] font-medium text-stone-500 mb-1">Attach to step (optional)</span>
              <select className="w-full rounded-lg border border-stone-300 px-2 py-1.5" value={stepId} onChange={(e) => setStepId(e.target.value)}>
                <option value="">— none —</option>
                {steps.map((s) => <option key={s.id} value={s.id}>#{s.stepNo} {s.title}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] font-medium text-stone-500 mb-1">Caption (optional)</span>
              <input className="w-full rounded-lg border border-stone-300 px-2 py-1.5" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="block text-[10px] font-medium text-stone-500 mb-1">File(s)</span>
            <input
              type="file"
              multiple
              onChange={(e) => onFiles(e.target.files)}
              disabled={busy || pending}
              className="text-xs"
            />
          </label>
          {busy && <p className="text-xs text-stone-500">Uploading…</p>}
          {error && <p className="text-xs text-rose-700">{error}</p>}
        </div>
      )}

      {kinds.map((k) => {
        const items = byKind.get(k) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={k} className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
            <div className="text-[10px] uppercase tracking-widest text-stone-500 px-4 py-2 bg-stone-50">{KIND_LABEL[k] ?? k}</div>
            <ul className="divide-y divide-stone-100">
              {items.map((a) => (
                <li key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                  <a href={a.url} target="_blank" rel="noopener" className="text-sky-600 hover:text-sky-800 truncate min-w-0">
                    {a.name}
                  </a>
                  <span className="text-stone-400">{a.size ? `${Math.round(a.size / 1024)} KB` : ""}</span>
                  {a.caption && <span className="text-stone-500 truncate">— {a.caption}</span>}
                  <span className="ml-auto text-stone-400 whitespace-nowrap">{a.uploadedBy ?? "—"} · {a.createdAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {artifacts.length === 0 && (
        <p className="text-xs text-stone-400 italic">No artifacts yet.</p>
      )}
    </div>
  );
}
