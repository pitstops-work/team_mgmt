"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { CV_ACCEPT, cvContentType, validateCvFile } from "@/lib/recruitment/cvFiles";
import {
  describeNetworkFailure,
  describeServerFailure,
  fetchRetrying,
  isNetworkError,
} from "@/lib/recruitment/fetchRetry";
import TriageReview, { type TriageAssignment, type TriageCity } from "./TriageReview";

type Phase = "idle" | "uploading" | "sorting" | "scouting";

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
  // Cities this run covers. One posting for a multi-city JD draws CVs for
  // every city at once, so this is a set, not a single pick. With 2+ selected
  // the run goes through triage and produces one desk PER city — generation
  // itself is always single-city (see lib/recruitment/locations.ts).
  const [locationIds, setLocationIds] = useState<string[]>(
    jobs[0]?.locations[0]?.id ? [jobs[0].locations[0].id] : [],
  );
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Set once the CVs are uploaded and sorted; presence of this switches the
  // form over to the review step. Holds the blob refs so the run the server
  // takes over doesn't need them re-uploaded.
  //
  // The id is minted here and reused across retries: starting a run is
  // idempotent on it, so a lost response can't produce two runs building the
  // same desks. It is the ONLY run state the browser holds — everything about
  // what has actually been built lives on the server now.
  const runIdRef = useRef<string>("");
  const [triage, setTriage] = useState<
    { cities: TriageCity[]; assignments: TriageAssignment[]; cvs: { url: string; name: string }[] } | null
  >(null);

  const busy = phase !== "idle";
  const jobless = jobId === "";
  const selectedJob = jobs.find((j) => j.id === jobId) ?? null;
  const jobLocations = selectedJob?.locations ?? [];
  const multiCity = locationIds.length > 1;

  // Keep the selection valid when the JD changes — default to its primary.
  const pickJob = (nextJobId: string) => {
    setJobId(nextJobId);
    const next = jobs.find((j) => j.id === nextJobId);
    setLocationIds(next?.locations[0]?.id ? [next.locations[0].id] : []);
  };

  const toggleCity = (id: string) =>
    setLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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

      // Multi-city: sort the pile first and hand the split to the recruiter.
      // Nothing is generated until they confirm it.
      if (multiCity) {
        setPhase("sorting");
        setProgress("Sorting CVs by city…");
        // Retryable: triage only reads the CVs and returns a split, so a
        // repeat after a dropped connection costs a model call and nothing else.
        const res = await fetchRetrying("/api/recruitment/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, locationIds, cvs }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || describeServerFailure(res.status, "sort the CVs"));
        // Fresh sort => fresh run id, or the retry-idempotency on the old one
        // would make the server hand back the previous run.
        runIdRef.current = "";
        setTriage({ cities: json.cities, assignments: json.assignments, cvs });
        setPhase("idle");
        setProgress("");
        return;
      }

      setPhase("scouting");
      setProgress("Scouting the pool — this takes a few minutes…");
      // Deliberately NOT retried: this call writes a desk, and a repeat after
      // a lost response builds a second one. Multi-city runs don't come
      // through here at all — they hand the whole plan to the server.
      const res = await fetch("/api/recruitment/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          date,
          // Only send context when there is no JD; a picked JD supplies its own notes.
          context: jobless ? context.trim() : "",
          jobId: jobless ? null : jobId,
          locationId: jobless ? null : locationIds[0] || null,
          cvs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || describeServerFailure(res.status, "build the desk"));
      router.push(`/recruitment/${json.slug}`);
    } catch (err) {
      setError(
        isNetworkError(err)
          ? // Sorting writes nothing; building a desk does, and by the time the
            // connection drops the server may already have finished it.
            describeNetworkFailure(multiCity ? "sort the CVs" : "build the desk", !multiCity)
          : err instanceof Error
            ? err.message
            : "Something went wrong",
      );
      setPhase("idle");
      setProgress("");
    }
  }

  /**
   * Hand the whole multi-city run to the server, then get out of the way.
   *
   * This used to be a for-loop right here: one desk per city, each large desk
   * built in chunks of 8 CVs, every chunk a multi-minute fetch from this tab,
   * with progress in a React ref. An 89-CV run was ~25 minutes of that, and
   * on 2026-09-22 a single dropped connection ended one at 48 of 89 CVs —
   * `TypeError: Failed to fetch`, no server error, nothing in the logs,
   * because the request never reached the server. Closing the tab lost the
   * resume state and cost a 20-minute re-upload.
   *
   * So the loop moved to lib/recruitment/batchRunner.ts, which records
   * progress per COMMITTED chunk and re-kicks itself. All that is left here
   * is posting the plan and following the link. The browser can close; the
   * run cannot notice.
   */
  async function runBatch(byCity: { city: TriageCity | null; cvIndexes: number[] }[]) {
    if (!triage) return;
    setError(null);
    setPhase("scouting");
    setProgress("Handing the run to the server…");
    const runId = (runIdRef.current ||= `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

    try {
      // Retryable because of `runId`: the server treats a second start with
      // the same id as the same run, so a lost response costs a round trip
      // rather than a duplicate set of desks.
      const res = await fetchRetrying("/api/recruitment/batch/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          title: title.trim(),
          date,
          context: jobless ? context.trim() : "",
          jobId,
          desks: byCity.map(({ city, cvIndexes }) => ({
            // A null city is the unplaced pool — a real desk, scouted on the
            // role with no local context assumed. Its candidates get allocated
            // to a city from the desk itself.
            key: city ? city.id : "__unplaced__",
            label: city ? city.city : "Unplaced",
            locationId: city ? city.id : null,
            unplaced: !city,
            cvs: cvIndexes.map((n) => triage.cvs[n - 1]).filter(Boolean),
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || describeServerFailure(res.status, "start the run"));
      router.push(`/recruitment/batch/${json.batchId}`);
    } catch (err) {
      setError(
        isNetworkError(err) ? describeNetworkFailure("start the run") : err instanceof Error ? err.message : "Something went wrong",
      );
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

  if (triage) {
    return (
      <div className="mb-6">
        <TriageReview
          cities={triage.cities}
          assignments={triage.assignments}
          busy={busy}
          progress={progress}
          error={error}
          onCancel={() => { setTriage(null); setError(null); runIdRef.current = ""; }}
          onConfirm={runBatch}
        />
      </div>
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
          <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-0.5">Cities for this run</label>
          <div className="flex flex-wrap gap-1.5">
            {jobLocations.map((l) => {
              const on = locationIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleCity(l.id)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors disabled:opacity-40 ${
                    on ? "bg-sky-600 text-white border-sky-600" : "bg-white border-stone-200 text-stone-600 hover:border-sky-300"
                  }`}
                >
                  {l.city}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-stone-400 leading-relaxed">
            {locationIds.length <= 1 ? (
              <>
                The scout judges candidates against the city you pick — its language, local reference orgs and red
                flags go into the brief. Posted once for several cities? Select them all and the CVs get sorted.
              </>
            ) : (
              <>
                {locationIds.length} cities selected. The CVs will be sorted by city first — you&apos;ll see the split
                and can correct it — then each city gets its own desk, judged against its own local context.
              </>
            )}
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
