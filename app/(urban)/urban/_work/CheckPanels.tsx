"use client";

// One panel per check type (spec §4.3). Each collects its answer and calls
// onSubmit with a CompleteInput; the server re-validates everything.
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Camera, Loader2, Paperclip } from "lucide-react";
import type { CompleteInput } from "@/lib/urban/work";
import type { CheckContext, EvidenceView, TaskView } from "@/lib/urban/queries";

type SubmitFn = (input: CompleteInput) => void;

export function CheckPanel({ task, check, pending, onSubmit, onEvidenceAdded }: {
  task: TaskView; check: CheckContext; pending: boolean; onSubmit: SubmitFn; onEvidenceAdded: () => void;
}) {
  switch (task.checkType) {
    case "note": return <NotePanel pending={pending} onSubmit={onSubmit} hint={task.checkConfig?.hint} />;
    case "number": return <NumberPanel task={task} check={check} pending={pending} onSubmit={onSubmit} />;
    case "rating": return <RatingPanel task={task} check={check} pending={pending} onSubmit={onSubmit} />;
    case "observation": return <ObservationPanel task={task} check={check} pending={pending} onSubmit={onSubmit} />;
    case "voice":
    case "photo": return <EvidencePanel task={task} pending={pending} onSubmit={onSubmit} onEvidenceAdded={onEvidenceAdded} />;
    default: return <TickPanel pending={pending} onSubmit={onSubmit} />;
  }
}

function NoteBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500" />;
}

function SubmitButton({ pending, disabled, label, reason }: { pending: boolean; disabled?: boolean; label: string; reason?: string | null }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      {reason && <span className="text-xs text-amber-700">{reason}</span>}
      <button type="submit" disabled={pending || disabled} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40">
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}

// ── tick / note ────────────────────────────────────────────────────────────

function TickPanel({ pending, onSubmit }: { pending: boolean; onSubmit: SubmitFn }) {
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ note }); }} className="space-y-2">
      <NoteBox value={note} onChange={setNote} placeholder="Note (optional)" />
      <SubmitButton pending={pending} label="Mark done" />
    </form>
  );
}

function NotePanel({ pending, onSubmit, hint }: { pending: boolean; onSubmit: SubmitFn; hint?: string }) {
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ note }); }} className="space-y-2">
      <NoteBox value={note} onChange={setNote} placeholder={hint ?? "What was found or agreed"} />
      <SubmitButton pending={pending} disabled={!note.trim()} label="Save" />
    </form>
  );
}

// ── number (one figure, or one per scheme) ─────────────────────────────────

function NumberPanel({ task, check, pending, onSubmit }: { task: TaskView; check: CheckContext; pending: boolean; onSubmit: SubmitFn }) {
  const cfg = task.checkConfig ?? {};
  const reading = cfg.reading ? check.readings[cfg.reading] : undefined;
  const dims = cfg.per ? check.dimensions[cfg.per] ?? [] : [];
  const [single, setSingle] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const parse = (v: string) => (v.trim() === "" ? null : Number(v));
  const filled = dims.length ? Object.values(vals).filter((v) => v.trim() !== "").length : single.trim() !== "" ? 1 : 0;
  const [note, setNote] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dims.length) onSubmit({ note, values: Object.fromEntries(dims.map((d) => [d.key, parse(vals[d.key] ?? "")])) });
        else onSubmit({ note, value: parse(single) });
      }}
      className="space-y-3"
    >
      <p className="text-xs text-stone-500">{reading?.label ?? cfg.reading}{reading?.unit ? ` (${reading.unit})` : ""}{dims.length ? " — one figure per item; leave blank if not known" : ""}</p>
      {dims.length ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {dims.map((d) => (
            <label key={d.key} className="flex items-center justify-between gap-2 text-sm text-stone-700">
              <span className="truncate">{d.label}</span>
              <input inputMode="decimal" type="number" min={0} step="any" value={vals[d.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [d.key]: e.target.value }))} className="w-24 rounded-md border border-stone-300 px-2 py-1 text-right text-sm outline-none focus:border-stone-500" />
            </label>
          ))}
        </div>
      ) : (
        <input inputMode="decimal" type="number" min={0} step="any" value={single} onChange={(e) => setSingle(e.target.value)} autoFocus className="w-40 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500" />
      )}
      <NoteBox value={note} onChange={setNote} placeholder="Note (optional) — e.g. where the figure came from" />
      <SubmitButton pending={pending} disabled={filled === 0} label="Save figures" />
    </form>
  );
}

// ── rating (e.g. the 24-point safety check) ────────────────────────────────

function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return [...m.entries()];
}

function RatingPanel({ task, check, pending, onSubmit }: { task: TaskView; check: CheckContext; pending: boolean; onSubmit: SubmitFn }) {
  const points = check.lists[task.checkConfig?.list ?? ""] ?? [];
  const [marks, setMarks] = useState<Record<string, "ok" | "fail" | "na">>({});
  const [note, setNote] = useState("");
  const unrated = points.filter((p) => p.non_negotiable && !marks[p.key]).length;
  const failingNN = points.filter((p) => p.non_negotiable && marks[p.key] === "fail").length;
  const rated = Object.keys(marks).length;
  const set = (k: string, v: "ok" | "fail" | "na") => setMarks((m) => (m[k] === v ? Object.fromEntries(Object.entries(m).filter(([x]) => x !== k)) as typeof m : { ...m, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ note, marks }); }} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-stone-500">{rated} of {points.length} rated</span>
        <button type="button" onClick={() => setMarks(Object.fromEntries(points.map((p) => [p.key, marks[p.key] ?? "ok"])))} className="font-medium text-stone-600 hover:text-stone-900">Mark the rest OK</button>
      </div>
      <div className="space-y-3">
        {groupBy(points, (p) => p.category ?? "").map(([cat, ps]) => (
          <div key={cat || "_"}>
            {cat && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{cat}</p>}
            <ul className="space-y-1">
              {ps.map((p) => (
                <li key={p.key} className="flex items-start justify-between gap-2">
                  <span className="text-sm text-stone-700">{p.text}{p.non_negotiable && <span className="ml-1 text-[10px] font-semibold text-red-500">NON-NEG</span>}</span>
                  <span className="flex shrink-0 gap-1">
                    {(["ok", "fail", "na"] as const).filter((v) => v !== "na" || p.na_allowed).map((v) => (
                      <button key={v} type="button" onClick={() => set(p.key, v)} className={`rounded-md border px-2 py-0.5 text-xs font-medium ${marks[p.key] === v ? (v === "ok" ? "border-emerald-500 bg-emerald-500 text-white" : v === "fail" ? "border-red-500 bg-red-500 text-white" : "border-stone-400 bg-stone-400 text-white") : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                        {v === "ok" ? "OK" : v === "fail" ? "Not OK" : "N/A"}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {failingNN > 0 && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{failingNN} non-negotiable{failingNN > 1 ? "s" : ""} not OK — a partner follow-up will be raised for each.</p>}
      <NoteBox value={note} onChange={setNote} placeholder="Note (optional)" />
      <SubmitButton pending={pending} disabled={unrated > 0} reason={unrated > 0 ? `${unrated} non-negotiable${unrated > 1 ? "s" : ""} to rate` : null} label="Save rating" />
    </form>
  );
}

// ── observation (e.g. caregiver practices) — exception-based ───────────────

function ObservationPanel({ task, check, pending, onSubmit }: { task: TaskView; check: CheckContext; pending: boolean; onSubmit: SubmitFn }) {
  const points = check.lists[task.checkConfig?.list ?? ""] ?? [];
  const [flags, setFlags] = useState<Record<string, "gap" | "escalate">>({});
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? points.filter((p) => `${p.text} ${p.category ?? ""} ${p.meta?.label ?? ""}`.toLowerCase().includes(s)) : points;
  }, [points, q]);
  const toggle = (k: string, v: "gap" | "escalate") => setFlags((f) => (f[k] === v ? Object.fromEntries(Object.entries(f).filter(([x]) => x !== k)) as typeof f : { ...f, [k]: v }));
  const gaps = Object.values(flags).filter((v) => v === "gap").length;
  const esc = Object.values(flags).filter((v) => v === "escalate").length;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ note, flags }); }} className="space-y-3">
      <p className="text-xs text-stone-500">Mark only what isn&apos;t right. Everything unmarked counts as seen and fine. <b>Escalate</b> raises a partner follow-up.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${points.length} practices…`} className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-stone-500" />
      <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
        {groupBy(shown, (p) => p.category ?? "").map(([cat, ps]) => (
          <div key={cat || "_"}>
            {cat && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{cat}</p>}
            <ul className="space-y-1">
              {ps.map((p) => (
                <li key={p.key} className="flex items-start justify-between gap-2">
                  <span className="text-sm text-stone-700">
                    {p.meta?.label ? <b className="font-medium">{String(p.meta.label)}. </b> : null}<span className="text-stone-500">{p.text}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {(["gap", "escalate"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => toggle(p.key, v)} className={`rounded-md border px-2 py-0.5 text-xs font-medium ${flags[p.key] === v ? (v === "gap" ? "border-amber-500 bg-amber-500 text-white" : "border-red-500 bg-red-500 text-white") : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                        {v === "gap" ? "Gap" : "Escalate"}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <NoteBox value={note} onChange={setNote} placeholder="Note (optional)" />
      <SubmitButton pending={pending} label={gaps + esc ? `Save (${gaps} gap${gaps === 1 ? "" : "s"}, ${esc} escalated)` : "Save — all fine"} />
    </form>
  );
}

// ── voice / photo — evidence first, then mark done ─────────────────────────

export function EvidenceList({ evidence }: { evidence: EvidenceView[] }) {
  if (!evidence.length) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {evidence.map((ev) =>
        ev.kind === "voice" ? (
          <div key={ev.id} className="w-full max-w-sm">
            <audio controls preload="none" src={`/api/urban/evidence/${ev.id}`} className="h-8 w-full" />
            {ev.transcript && <p className="mt-0.5 line-clamp-3 text-xs italic text-stone-500">“{ev.transcript}”</p>}
          </div>
        ) : ev.kind === "photo" ? (
          <a key={ev.id} href={`/api/urban/evidence/${ev.id}`} target="_blank" rel="noreferrer">
            {/* Private file behind an access check; next/image can't fetch it. */}
            <img src={`/api/urban/evidence/${ev.id}`} alt={ev.name} className="h-14 w-14 rounded-md border border-stone-200 object-cover" />
          </a>
        ) : (
          <a key={ev.id} href={`/api/urban/evidence/${ev.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-stone-600 underline"><Paperclip size={11} /> {ev.name}</a>
        ),
      )}
    </div>
  );
}

function EvidencePanel({ task, pending, onSubmit, onEvidenceAdded }: { task: TaskView; pending: boolean; onSubmit: SubmitFn; onEvidenceAdded: () => void }) {
  const voice = task.checkType === "voice";
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function upload(file: Blob, name: string) {
    setState("uploading");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("taskId", task.id);
      fd.append("file", file, name);
      const res = await fetch("/api/urban/evidence", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Upload failed");
      onEvidenceAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setState("idle");
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        // iOS records audio/mp4, not webm; label with what was actually recorded.
        const mime = (mr.mimeType || "audio/webm").split(";")[0];
        upload(new Blob(chunks.current, { type: mime }), `voice-note.${mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm"}`);
      };
      rec.current = mr;
      mr.start();
      setSecs(0);
      setState("recording");
    } catch {
      setError("Microphone not available — allow microphone access and try again");
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const out = f.type.startsWith("image/") ? await downscale(f) : f;
    upload(out, out === f ? f.name : f.name.replace(/\.[^.]+$/, "") + ".jpg");
  }

  const have = task.evidence.length;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ note }); }} className="space-y-3">
      <EvidenceList evidence={task.evidence} />
      <div className="flex flex-wrap items-center gap-2">
        {voice ? (
          state === "recording" ? (
            <button type="button" onClick={() => rec.current?.stop()} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">
              <Square size={13} /> Stop · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            </button>
          ) : (
            <button type="button" disabled={state === "uploading"} onClick={startRecording} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              {state === "uploading" ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
              {state === "uploading" ? "Saving…" : have ? "Record another" : "Record voice note"}
            </button>
          )
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onPick} className="hidden" />
            <button type="button" disabled={state === "uploading"} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              {state === "uploading" ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {state === "uploading" ? "Uploading…" : have ? "Add another" : "Add photo or file"}
            </button>
          </>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      <NoteBox value={note} onChange={setNote} placeholder="Note (optional)" />
      <SubmitButton pending={pending} disabled={!have || state !== "idle"} reason={!have ? (voice ? "Record a voice note first" : "Add a photo or file first") : null} label="Mark done" />
    </form>
  );
}

// Phone photos run 4–8 MB; Vercel refuses bodies over 4.5 MB. Re-encode to a
// 1600px JPEG; if the browser can't decode it, send the original.
async function downscale(f: File): Promise<Blob> {
  if (f.size < 1_000_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.82))) ?? f;
  } catch {
    return f;
  }
}
