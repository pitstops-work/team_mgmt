"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { CV_ACCEPT, cvContentType, validateCvFile } from "@/lib/recruitment/cvFiles";

type Phase = "idle" | "uploading" | "scouting";

export type JobPickerRow = {
  id: string;
  slug: string;
  title: string;
  /** Primary city — the default pick when the JD runs in several. */
  city: string;
  /** Every city this JD runs in. One entry for a single-city JD. */
  locations: { id: string; city: string }[];
};

export default function UploadForm({ jobs }: { jobs: JobPickerRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string>(jobs[0]?.id ?? "");
  // Which city this scouting day is for. The prompt carries exactly one city's
  // language, reference orgs and red flags, so a multi-city JD must resolve to
  // one here rather than let the server guess.
  const [locationId, setLocationId] = useState<string>(jobs[0]?.locations[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = phase !== "idle";
  const jobless = jobId === "";
  const selectedJob = jobs.find((j) => j.id === jobId) ?? null;
  const jobLocations = selectedJob?.locations ?? [];

  // Keep the city valid when the JD changes — default to the JD's primary.
  const pickJob = (nextJobId: string) => {
    setJobId(nextJobId);
    const next = jobs.find((j) => j.id === nextJobId);
    setLocationId(next?.locations[0]?.id ?? "");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || files.length === 0 || busy) return;
    setError(null);
    try {
      setPhase("uploading");
      const cvs: { url: string; name: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const invalid = validateCvFile(file);
        if (invalid) throw new Error(invalid);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const blob = await upload(`recruitment/cv-tmp/${safeName}`, file, {
          access: "private",
          contentType: cvContentType(file),
          handleUploadUrl: "/api/recruitment/upload-cv",
          multipart: true,
          onUploadProgress: ({ percentage }) =>
            setProgress(`Uploading CV ${i + 1} of ${files.length} — ${Math.round(percentage)}%`),
        });
        cvs.push({ url: blob.url, name: file.name });
      }

      setPhase("scouting");
      setProgress("Scouting the pool — this takes a few minutes…");
      const res = await fetch("/api/recruitment/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          date,
          // Only send context when there is no JD; a picked JD supplies its own notes.
          context: jobless ? context.trim() : "",
          jobId: jobless ? null : jobId,
          locationId: jobless ? null : locationId || null,
          cvs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Generation failed");
      router.push(`/recruitment/${json.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
      setProgress("");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-50 hover:border-sky-300 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        New scouting desk from CVs
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mb-6 rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <p className="text-sm font-medium text-stone-800">New scouting desk</p>

      <div>
        <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-0.5">Job description</label>
        <select
          value={jobId}
          onChange={(e) => pickJob(e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-stone-50"
        >
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.title} · {j.city}</option>
          ))}
          <option value="">— One-off (no saved JD)</option>
        </select>
        <p className="mt-1 text-[11px] text-stone-400">
          Pick a JD from the library, or run a one-off with free-text context.{" "}
          <Link href="/recruitment/jobs" className="text-sky-600 hover:underline">Manage JDs →</Link>
        </p>
      </div>

      {jobLocations.length > 1 && (
        <div>
          <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-0.5">City for this desk</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-stone-50"
          >
            {jobLocations.map((l) => (
              <option key={l.id} value={l.id}>{l.city}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-stone-400">
            This JD runs in {jobLocations.length} cities. The scout judges candidates against the city you pick —
            its language, local reference orgs and red flags go into the brief.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. RP Trials Chennai Aug 2026"
          disabled={busy}
          className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-stone-50"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={busy}
          className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-600 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-stone-50"
        />
      </div>

      {jobless && (
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Context for the scout — role, city, what you're hiring for, anything to watch for"
          rows={2}
          disabled={busy}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-stone-50"
        />
      )}

      <div>
        <input
          ref={fileInput}
          type="file"
          accept={CV_ACCEPT}
          multiple
          disabled={busy}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="hidden"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm text-stone-600 hover:border-sky-300 hover:text-sky-700 transition-colors disabled:opacity-50"
        >
          <FileUp className="w-4 h-4" />
          {files.length > 0 ? `${files.length} CV${files.length > 1 ? "s" : ""} selected` : "Select CV PDFs"}
        </button>
        {files.length > 0 && (
          <p className="mt-1.5 text-xs text-stone-400 truncate">{files.map((f) => f.name).join(" · ")}</p>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !title.trim() || files.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? progress : "Generate scouting desk"}
        </button>
        {!busy && (
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-stone-400 hover:text-stone-600">
            Cancel
          </button>
        )}
      </div>
      {phase === "scouting" && (
        <p className="text-xs text-stone-400">Keep this tab open — you&apos;ll be taken to the desk when it&apos;s ready.</p>
      )}
    </form>
  );
}
