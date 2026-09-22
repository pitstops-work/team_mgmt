"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { CV_ACCEPT, cvContentType, validateCvFile } from "@/lib/recruitment/cvFiles";
import TriageReview, { type TriageAssignment, type TriageCity } from "./TriageReview";

type Phase = "idle" | "uploading" | "sorting" | "scouting";

/**
 * CVs per generate/append request when building a desk.
 *
 * Bounded by OUTPUT tokens against the 300s route ceiling, not by input size:
 * a rendered candidate costs ~830-1,540 output tokens (measured on real
 * desks), and Opus streams on the order of 50-80 tokens/sec, so eight
 * candidates is roughly 7-12k tokens — comfortably inside 300s once CV
 * extraction is accounted for. Raising this is how the Unplaced desk timed
 * out on an 89-CV run.
 */
const DESK_CHUNK = 8;

/**
 * What to say when the server fails WITHOUT a JSON body.
 *
 * A 504 or a crashed function returns an HTML error page, so `json.error` is
 * undefined and the caller's fallback string is all the user ever sees. A bare
 * "Could not sort the CVs" sent the recruiter back with nothing to act on
 * after a 20-minute upload (2026-09-22, an 85-CV pool). Name the likely cause
 * and the next move instead.
 */
function describeServerFailure(status: number, what: string): string {
  if (status === 504 || status === 408) {
    return `Timed out trying to ${what} — the pool is probably too large for one run. Try splitting the CVs into two smaller runs.`;
  }
  if (status === 413) return `The upload was too large to ${what}. Try fewer CVs at once.`;
  if (status === 502 || status === 503) return `The server was unreachable while trying to ${what}. Wait a moment and try again.`;
  if (status >= 500) return `The server errored trying to ${what} (${status}). If it repeats, the pool size is the first thing to halve.`;
  return `Could not ${what} (${status}).`;
}


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
  // form over to the review step. Holds the blob refs so the generate calls
  // after confirmation don't need to re-upload.
  // Survives a failed run so a retry resumes instead of duplicating desks.
  const builtRef = useRef<Record<string, { slug: string | null; done: number }>>({});
  const batchIdRef = useRef<string>("");
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
        const res = await fetch("/api/recruitment/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, locationIds, cvs }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || describeServerFailure(res.status, "sort the CVs"));
        // Fresh sort => fresh run. Clear any resume state from a previous
        // attempt, or the next Scout would think those desks already exist.
        builtRef.current = {};
        batchIdRef.current = "";
        setTriage({ cities: json.cities, assignments: json.assignments, cvs });
        setPhase("idle");
        setProgress("");
        return;
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
          locationId: jobless ? null : locationIds[0] || null,
          cvs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || describeServerFailure(res.status, "build the desk"));
      router.push(`/recruitment/${json.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
      setProgress("");
    }
  }

  /**
   * Generate one desk per city, SEQUENTIALLY.
   *
   * Not Promise.all: each generate is a multi-minute Claude call against a
   * 300s route ceiling, and firing three at once would have them contend for
   * the same rate limit and all slow down together. Sequential also means a
   * failure on city 3 leaves cities 1 and 2 already built and openable.
   */
  /**
   * Generate one desk per group, SEQUENTIALLY, building any large group in
   * chunks.
   *
   * Chunking is not an optimisation, it is the only way a big desk completes.
   * A generate call streams roughly 830-1,540 output tokens per candidate
   * against a hard 300s route ceiling (Vercel's maximum — it cannot be
   * raised), so a 40-CV pool in one request times out. That is what killed the
   * Unplaced desk on the first 89-CV run: seven city desks were small enough,
   * the eighth had the leftovers. So the first chunk generates the desk and
   * each later chunk appends to it in its own request, with its own 300s.
   *
   * Appends are forced rather than left to decideMode, which would read chunk
   * 2 as "adding 8 to a pool of 8" and re-scout everything each time.
   *
   * Progress is kept in `builtRef` so a retry after a partial failure RESUMES
   * — it skips finished desks and continues a half-built one from where it
   * stopped, instead of duplicating the desks that already worked.
   */
  async function runBatch(byCity: { city: TriageCity | null; cvIndexes: number[] }[]) {
    if (!triage) return;
    setError(null);
    setPhase("scouting");
    const batchId = (batchIdRef.current ||= `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const built = builtRef.current;
    const total = byCity.length;

    try {
      for (let i = 0; i < byCity.length; i++) {
        const { city, cvIndexes } = byCity[i];
        // A null city is the unplaced pool — a real desk, scouted on the role
        // with no local context assumed. Its candidates get allocated to a
        // city from the desk itself.
        const label = city ? city.city : "Unplaced";
        const key = city ? city.id : "__unplaced__";
        const prior = built[key] ?? { slug: null as string | null, done: 0 };
        if (prior.slug && prior.done >= cvIndexes.length) continue; // already finished

        const chunks: number[][] = [];
        for (let n = prior.done; n < cvIndexes.length; n += DESK_CHUNK) {
          chunks.push(cvIndexes.slice(n, n + DESK_CHUNK));
        }
        const parts = Math.ceil(cvIndexes.length / DESK_CHUNK);

        for (const chunk of chunks) {
          const partNo = Math.floor(prior.done / DESK_CHUNK) + 1;
          setProgress(
            `Scouting ${label} — desk ${i + 1} of ${total}` +
              (parts > 1 ? ` · part ${partNo} of ${parts} (${cvIndexes.length} CVs)` : "") +
              "…",
          );
          const cvs = chunk.map((n) => triage.cvs[n - 1]).filter(Boolean);

          const res = prior.slug
            ? await fetch(`/api/recruitment/${prior.slug}/add-cvs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cvs, forceAppend: true }),
              })
            : await fetch("/api/recruitment/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  // The city is part of the title so the desks are tellable
                  // apart in the listing, where they otherwise sit together.
                  title: `${title.trim()} — ${label}`,
                  date,
                  context: "",
                  jobId,
                  locationId: city ? city.id : null,
                  unplaced: !city,
                  batchId,
                  cvs,
                }),
              });

          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            const doneDesks = Object.values(built).filter((b) => b.slug).length;
            const why = json.error || describeServerFailure(res.status, `build the ${label} desk`);
            throw new Error(
              doneDesks > 0
                ? `${label} failed: ${why} ${doneDesks} desk${doneDesks === 1 ? "" : "s"} already built — press Scout again to carry on from here rather than starting over.`
                : why,
            );
          }
          prior.slug = prior.slug ?? json.slug;
          prior.done += chunk.length;
          built[key] = prior;
        }
      }
      // Whole run succeeded — now, and only now, drop the temp CVs. Deleting
      // them desk-by-desk is what made a failed batch impossible to retry.
      // Best-effort: a cleanup failure must not cost the desks just built.
      try {
        await fetch("/api/recruitment/cleanup-cvs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvs: triage.cvs }),
        });
      } catch {
        /* temp CVs linger; the desks are what matter */
      }
      router.push(`/recruitment/batch/${batchId}`);
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

  if (triage) {
    return (
      <div className="mb-6">
        <TriageReview
          cities={triage.cities}
          assignments={triage.assignments}
          busy={busy}
          progress={progress}
          error={error}
          onCancel={() => { setTriage(null); setError(null); builtRef.current = {}; batchIdRef.current = ""; }}
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
