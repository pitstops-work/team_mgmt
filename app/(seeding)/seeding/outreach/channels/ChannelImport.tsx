"use client";

// Paste a block straight out of Excel/Sheets. The parse here is a PREVIEW only —
// importSeedingChannels re-parses server-side and never trusts this.

import { useMemo, useState, useTransition } from "react";
import {
  parseChannelTsv, IMPORT_COLUMNS, MAX_IMPORT_ROWS,
  CHANNEL_KIND_META, CHANNEL_KIND_ORDER,
} from "@/lib/seeding/outreach";
import type { ImportResult } from "@/lib/seeding/outreach";
import { importSeedingChannels } from "../actions";

export default function ChannelImport({
  geoId, geoLabel, existingKeys, subGeoLabels,
}: {
  geoId: string | null;
  geoLabel: string;
  existingKeys: string[];
  subGeoLabels: string[];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const taken = useMemo(() => new Set(existingKeys), [existingKeys]);
  const preview = useMemo(() => (text.trim() ? parseChannelTsv(text) : null), [text]);
  const newRows = preview?.rows.filter((r) => !taken.has(r.nameKey)) ?? [];
  const dupeRows = preview?.rows.filter((r) => taken.has(r.nameKey)) ?? [];

  const submit = () =>
    start(async () => {
      try {
        setErr(null);
        const out = await importSeedingChannels(geoId, text);
        setResult(out);
        if (out.created > 0) setText("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Import failed");
      }
    });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="text-xs text-sky-600 hover:underline">
        Paste a list from your spreadsheet →
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-stone-700">Paste channels into {geoLabel}</div>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-stone-500 hover:text-stone-800">Close</button>
      </div>

      <p className="text-[11px] text-stone-500">
        Copy the rows out of your sheet including the header row and paste below. Columns are matched by name in any
        order; unknown columns are ignored. <strong>name</strong> and <strong>kind</strong> are required
        (kind: {CHANNEL_KIND_ORDER.map((k) => CHANNEL_KIND_META[k].label).join(", ")} — friendly words like
        &ldquo;College&rdquo; work too). Recognised: <code className="text-stone-600">{IMPORT_COLUMNS.join(", ")}</code>.
        Max {MAX_IMPORT_ROWS} rows. Nothing already in the directory is overwritten — a repeat paste just reports skips.
        {subGeoLabels.length > 0 && <> Sub-geos available: {subGeoLabels.join(", ")}.</>}
      </p>

      <textarea
        className="w-full rounded border border-stone-300 px-2 py-1.5 text-xs font-mono"
        rows={6}
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); }}
        placeholder={"name\tkind\tsubGeo\tcontactName\tcontactPhone\nSt. Joseph's College\tCollege\tSouth\tR. Menon\t98xxxxxxxx"}
      />

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      {preview && (
        <div className="rounded-lg border border-stone-200 overflow-hidden">
          <div className="px-3 py-2 bg-stone-50 text-[11px] text-stone-600 flex flex-wrap gap-3">
            <span className="text-emerald-700">{newRows.length} new</span>
            <span className="text-stone-500">{dupeRows.length} already in the directory</span>
            {preview.errors.length > 0 && <span className="text-rose-600">{preview.errors.length} problem{preview.errors.length === 1 ? "" : "s"}</span>}
          </div>
          {preview.errors.length > 0 && (
            <ul className="px-3 py-2 text-[11px] text-rose-700 space-y-0.5 border-t border-stone-100">
              {preview.errors.slice(0, 12).map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
              {preview.errors.length > 12 && <li className="text-stone-400">…and {preview.errors.length - 12} more</li>}
            </ul>
          )}
          {newRows.length > 0 && (
            <div className="max-h-48 overflow-auto border-t border-stone-100">
              <table className="w-full text-[11px]">
                <thead><tr className="text-stone-400 bg-stone-50/60">
                  <th className="px-3 py-1.5 text-left font-medium">Name</th>
                  <th className="px-3 py-1.5 text-left font-medium">Kind</th>
                  <th className="px-3 py-1.5 text-left font-medium">Sub-geo</th>
                  <th className="px-3 py-1.5 text-left font-medium">Contact</th>
                </tr></thead>
                <tbody>
                  {newRows.slice(0, 50).map((r) => (
                    <tr key={r.line} className="border-t border-stone-100">
                      <td className="px-3 py-1.5 text-stone-700">{r.name}</td>
                      <td className="px-3 py-1.5 text-stone-500">{CHANNEL_KIND_META[r.kind].label}</td>
                      <td className="px-3 py-1.5 text-stone-500">{r.subGeoLabel ?? "—"}</td>
                      <td className="px-3 py-1.5 text-stone-500">{r.contactName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {newRows.length > 50 && <div className="px-3 py-1.5 text-[11px] text-stone-400 border-t border-stone-100">…and {newRows.length - 50} more</div>}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700">
          Imported <strong>{result.created}</strong>, skipped <strong>{result.skipped}</strong>.
          {result.errors.length > 0 && (
            <ul className="mt-1 text-[11px] text-stone-500 space-y-0.5">
              {result.errors.slice(0, 12).map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
              {result.errors.length > 12 && <li>…and {result.errors.length - 12} more</li>}
            </ul>
          )}
        </div>
      )}

      <button type="button" disabled={pending || newRows.length === 0} onClick={submit}
        className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:bg-stone-300">
        {pending ? "Importing…" : `Import ${newRows.length} channel${newRows.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
