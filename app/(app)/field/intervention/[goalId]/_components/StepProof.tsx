"use client";

// Closure proof for one /field step: record a voice note or add a photo, and
// show what has been recorded. Uploads go to /api/field/proof, which only
// RECORDS the proof — the step is still closed by its normal tick / complete,
// which the server refuses until a proof exists.
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Camera, Loader2, Paperclip } from "lucide-react";
import { normalizeClosureType } from "@/lib/field/closure";

export type Proof = { id: string; name: string; mimeType: string | null; createdAt: string };

export function StepProof({
  kind, stepId, closureType, proofs, note, disabled, done, onRecorded,
}: {
  kind: "setup" | "visit";
  stepId: string;
  closureType: string;
  proofs: Proof[];
  note: string | null;
  disabled: boolean;
  /** A done step shows its proof but offers no further capture. */
  done: boolean;
  onRecorded: () => void;
}) {
  const type = normalizeClosureType(closureType);
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Release the mic if the step unmounts mid-recording.
  useEffect(() => () => recRef.current?.stream.getTracks().forEach((t) => t.stop()), []);

  if (type === "Activity") return null;

  async function upload(file: Blob, name: string) {
    setState("uploading");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("stepId", stepId);
      fd.append("file", file, name);
      const res = await fetch("/api/field/proof", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Upload failed");
      onRecorded();
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
        // Label with what the browser actually recorded: iOS Safari makes
        // audio/mp4, not webm, and the transcriber goes by the type.
        const mime = (mr.mimeType || "audio/webm").split(";")[0];
        const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
        upload(new Blob(chunks.current, { type: mime }), `voice-note.${ext}`);
      };
      recRef.current = mr;
      mr.start();
      setSecs(0);
      setState("recording");
    } catch {
      setError("Microphone not available — allow mic access and try again");
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const out = f.type.startsWith("image/") ? await downscale(f) : f;
    upload(out, out instanceof File ? out.name : f.name.replace(/\.[^.]+$/, "") + ".jpg");
  }

  const busy = disabled || state === "uploading";
  return (
    <div className="mt-1 space-y-1">
      {proofs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {proofs.map((p) =>
            (p.mimeType ?? "").startsWith("audio/") ? (
              <audio key={p.id} controls preload="none" src={`/api/attachment/${p.id}`} className="h-8 max-w-[15rem]" />
            ) : (p.mimeType ?? "").startsWith("image/") ? (
              <a key={p.id} href={`/api/attachment/${p.id}`} target="_blank" rel="noreferrer">
                <img src={`/api/attachment/${p.id}`} alt={p.name} className="h-12 w-12 rounded-md border border-stone-200 object-cover" />
              </a>
            ) : (
              <a key={p.id} href={`/api/attachment/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-stone-600 underline">
                <Paperclip size={11} /> {p.name}
              </a>
            ),
          )}
        </div>
      )}
      {note && <p className="line-clamp-3 text-xs italic text-stone-500">“{note}”</p>}

      {!done && (
        <div className="flex items-center gap-2">
          {type === "Voice" ? (
            state === "recording" ? (
              <button onClick={() => recRef.current?.stop()} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500">
                <Square size={11} /> Stop · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
              </button>
            ) : (
              <button disabled={busy} onClick={startRecording} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
                {state === "uploading" ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
                {state === "uploading" ? "Saving…" : proofs.length ? "Record another" : "Record voice note"}
              </button>
            )
          ) : (
            <>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onPick} className="hidden" />
              <button disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
                {state === "uploading" ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                {state === "uploading" ? "Uploading…" : proofs.length ? "Add another" : "Add photo"}
              </button>
            </>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}

// Phone photos are routinely 4–8 MB; Vercel refuses bodies over 4.5 MB before
// the route runs. Re-encode to a 1600px JPEG. If the browser can't decode the
// image (e.g. HEIC on desktop Chrome), send the original and let the server's
// size check speak.
async function downscale(f: File): Promise<Blob> {
  if (f.size < 1_000_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ?? f;
  } catch {
    return f;
  }
}
