"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";

type Result = {
  rows: number;
  created: number;
  updated: number;
  noGeography: number;
  mapping: { header: string; to: string }[];
  unmatchedFiles: string[];
  problems: string[];
  dryRun: boolean;
};

const DOC_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export default function ImportClient() {
  const [sheet, setSheet] = useState<File | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<{ name: string; url: string }[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function uploadDocs(): Promise<{ name: string; url: string }[]> {
    if (uploaded) return uploaded;
    const out: { name: string; url: string }[] = [];
    for (let i = 0; i < docs.length; i++) {
      const f = docs[i];
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      const type = DOC_TYPES[ext];
      if (!type) throw new Error(`${f.name}: only PDF, DOCX, JPG and PNG files can be attached.`);
      setProgress(`Uploading documents: ${i + 1} of ${docs.length}`);
      const safe = f.name.replace(/[^\w.\-]+/g, "_");
      const blob = await upload(`seeding/screening/docs/${safe}`, f, {
        access: "private",
        contentType: type,
        handleUploadUrl: "/api/seeding/screening/upload",
        multipart: f.size > 5 * 1024 * 1024,
      });
      out.push({ name: f.name, url: blob.url });
    }
    setUploaded(out);
    return out;
  }

  async function run(dryRun: boolean) {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    try {
      const files = dryRun ? docs.map((d) => ({ name: d.name, url: `https://pending.invalid/${encodeURIComponent(d.name)}` })) : await uploadDocs();
      setProgress(dryRun ? "Checking the spreadsheet…" : "Importing…");
      const form = new FormData();
      form.append("sheet", sheet);
      form.append("files", JSON.stringify(files));
      if (dryRun) form.append("dryRun", "1");
      const res = await fetch("/api/seeding/screening/import", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Import failed (${res.status})`);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-4 space-y-3">
        <label className="block text-sm text-stone-700">
          Spreadsheet (CSV or Excel), one row per application
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              setSheet(e.target.files?.[0] ?? null);
              setResult(null);
            }}
            className="mt-1 block text-sm"
          />
          <span className="block text-[11px] text-stone-500 mt-0.5">
            Needs an application reference, name and email for each row. Other columns are kept as they are.{" "}
            <a href="/api/seeding/screening/template" className="text-sky-600 hover:underline">
              Download a template
            </a>
            .
          </span>
        </label>
        <label className="block text-sm text-stone-700">
          CVs, statements of purpose and other documents
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            onChange={(e) => {
              setDocs(Array.from(e.target.files ?? []));
              setUploaded(null);
              setResult(null);
            }}
            className="mt-1 block text-sm"
          />
          <span className="block text-[11px] text-stone-500 mt-0.5">
            Each file name must contain the application reference, e.g. APP-0142_cv.pdf or APP-0142_sop.pdf. Words in the name
            (cv, sop, photo, class 10, degree, experience) say what the file is.
          </span>
        </label>
        <div className="flex gap-2">
          <button
            disabled={!sheet || busy}
            onClick={() => run(true)}
            className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:border-stone-400 disabled:opacity-50"
          >
            Check first
          </button>
          <button
            disabled={!sheet || busy}
            onClick={() => run(false)}
            className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:bg-stone-300"
          >
            Import
          </button>
          {progress && <span className="text-xs text-stone-500 self-center">{progress}</span>}
        </div>
        {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>

      {result && (
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-4 space-y-3 text-sm">
          <p className="font-medium text-stone-800">
            {result.dryRun
              ? `${result.rows} rows read. Nothing has been imported yet.`
              : `${result.created} new, ${result.updated} updated. First reads have started.`}
          </p>
          {result.noGeography > 0 && (
            <p className="text-amber-700 text-xs">
              {result.noGeography} rows have a geography that doesn&apos;t match Bangalore Urban, Eastern UP, Odisha or North-East
              India. They will show as Unassigned and only the central team will see them.
            </p>
          )}
          {result.problems.length > 0 && (
            <div>
              <p className="text-xs font-medium text-rose-700">Problems</p>
              <ul className="text-xs text-rose-700 list-disc pl-5">
                {result.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {result.unmatchedFiles.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-700">Files that matched no application</p>
              <p className="text-xs text-amber-700">{result.unmatchedFiles.join(", ")}</p>
            </div>
          )}
          <details>
            <summary className="text-xs text-stone-500 cursor-pointer">How the columns were read</summary>
            <table className="mt-2 text-xs">
              <tbody>
                {result.mapping.map((m) => (
                  <tr key={m.header}>
                    <td className="pr-4 py-0.5 text-stone-600">{m.header}</td>
                    <td className="text-stone-400">{m.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </div>
  );
}
