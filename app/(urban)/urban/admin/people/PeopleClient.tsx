"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchPlaces, PLACE_LEVELS_ORDERED } from "@/lib/urban/placeSearch";
import { addAssignment, removeAssignment, importPlacesAction, importPartnersAction, addSite, savePartner } from "../actions";

type PlaceOpt = { id: string; level: string; path: string; name: string; imported?: boolean };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: (r: never) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setNotice({ tone: "err", text: r.error ?? "Failed" });
      else { setNotice(ok ? { tone: "ok", text: ok(r as never) } : null); router.refresh(); }
    });
  return { pending, notice, run };
}

function Notice({ n }: { n: { tone: "ok" | "err"; text: string } | null }) {
  if (!n) return null;
  return <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${n.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{n.text}</p>;
}

const MAX_SHOWN = 100;

/**
 * Search places by name (ranked: exact, starts with, word starts with, contains, path), with
 * optional level chips. Opens on focus, so you can browse a level without typing.
 */
function PlacePicker({ places, value, onChange, levels, placeholder }: { places: PlaceOpt[]; value: string; onChange: (id: string) => void; levels?: string[]; placeholder: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const available = useMemo(() => PLACE_LEVELS_ORDERED.filter((l) => (!levels || levels.includes(l)) && places.some((p) => p.level === l)), [places, levels]);
  const [level, setLevel] = useState<string>(""); // "" = every allowed level
  const matches = useMemo(() => searchPlaces(places, q, level ? [level] : levels), [places, q, level, levels]);
  const shown = matches.slice(0, MAX_SHOWN);
  const sel = places.find((p) => p.id === value);
  if (sel) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm">
        <span className="truncate"><span className="mr-1 text-[10px] uppercase text-stone-400">{sel.level}</span>{sel.path}</span>
        <button type="button" onClick={() => onChange("")} className="ml-2 text-xs text-stone-500 underline">change</button>
      </div>
    );
  }
  return (
    <div className="relative" onBlur={() => setOpen(false)}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-stone-500" />
      {open && (
        // preventDefault on mousedown keeps focus in the search box, so the list is
        // still mounted when the click lands. Safari doesn't focus a clicked
        // <button>, so without this the input's blur closed the list first and
        // the click hit nothing.
        <div onMouseDown={(e) => e.preventDefault()} className="absolute z-10 mt-1 w-full rounded-lg border border-stone-200 bg-white shadow-lg">
          {available.length > 1 && (
            <div className="flex flex-wrap gap-1 border-b border-stone-100 px-2 py-1.5">
              {["", ...available].map((l) => (
                <button key={l || "all"} type="button" onClick={() => setLevel(l)} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${level === l ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>
                  {l ? `${l === "city" ? "Cities" : `${l[0].toUpperCase()}${l.slice(1)}s`} · ${places.filter((p) => p.level === l).length}` : "All"}
                </button>
              ))}
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { onChange(p.id); setQ(""); setOpen(false); }} className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-stone-50">
                  <span className="mr-1 text-[10px] uppercase text-stone-400">{p.level}</span>{p.path}
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-3 py-2 text-xs text-stone-500">No match.</li>}
          </ul>
          {matches.length > shown.length && (
            <p className="border-t border-stone-100 px-3 py-1.5 text-[11px] text-stone-500">Showing {shown.length} of {matches.length} — keep typing or pick a level to narrow.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── People ─────────────────────────────────────────────────────────────────

type Person = { id: string; name: string; email: string; role: string; readOnly: boolean; reportsTo: string | null; assignments: { id: string; place: string; programme: string }[] };

export function AssignmentsPanel({ people, places, programmes }: { people: Person[]; places: PlaceOpt[]; programmes: { key: string; name: string }[] }) {
  const { pending, notice, run } = useAct();
  const [open, setOpen] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [programmeKey, setProgrammeKey] = useState("");
  const [q, setQ] = useState("");
  const shown = people.filter((p) => !q || `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <Notice n={notice} />
      {places.length === 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No places yet — import them on the Places tab first.</p>}
      <div className="mb-3 flex items-center justify-between gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${people.length} people…`} className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none" />
        <p className="hidden text-xs text-stone-500 sm:block">Role and reporting line come from the user settings; assignments are set here.</p>
      </div>
      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {shown.map((p) => (
          <div key={p.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-stone-900">{p.name}</span>
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">{p.role}{p.readOnly ? " · view only" : ""}</span>
              {p.reportsTo && <span className="text-xs text-stone-400">reports to {p.reportsTo}</span>}
              <button onClick={() => { setOpen(open === p.id ? null : p.id); setPlaceId(""); setProgrammeKey(""); }} className="ml-auto text-xs font-medium text-stone-600 hover:text-stone-900">
                {open === p.id ? "Done" : "+ Assign"}
              </button>
            </div>
            {p.assignments.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {p.assignments.map((a) => (
                  <li key={a.id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
                    {a.place} · {a.programme}
                    <button disabled={pending} onClick={() => run(() => removeAssignment(a.id))} className="text-sky-500 hover:text-red-600" aria-label="Remove">×</button>
                  </li>
                ))}
              </ul>
            )}
            {open === p.id && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                <PlacePicker places={places} value={placeId} onChange={setPlaceId} placeholder="Search a city, zone, cluster, settlement or site…" />
                <select value={programmeKey} onChange={(e) => setProgrammeKey(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
                  <option value="">All programmes</option>
                  {programmes.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
                <button disabled={pending || !placeId} onClick={() => run(() => addAssignment({ userId: p.id, placeId, programmeKey }), () => "Assigned.")} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                  Assign
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Places ─────────────────────────────────────────────────────────────────

export function PlacesPanel({ places, counts }: { places: PlaceOpt[]; counts: Record<string, number> }) {
  const { pending, notice, run } = useAct();
  const [settlementId, setSettlementId] = useState("");
  const [siteName, setSiteName] = useState("");
  const sites = places.filter((p) => p.level === "site");

  return (
    <div className="space-y-6">
      <Notice n={notice} />
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-stone-900">The place tree</p>
            <p className="text-xs text-stone-500">
              {(["city", "zone", "cluster", "settlement", "site"] as const).map((l) => { const n = counts[l] ?? 0; return `${n} ${n === 1 ? l : l === "city" ? "cities" : `${l}s`}`; }).join(" · ")}
            </p>
          </div>
          <button
            disabled={pending}
            onClick={() => run(importPlacesAction, (r: { data: { added: number; updated: number; deactivated: number; skipped: string[] } }) =>
              `Import done: ${r.data.added} added, ${r.data.updated} updated, ${r.data.deactivated} deactivated${r.data.skipped.length ? `; ${r.data.skipped.length} skipped (${r.data.skipped.slice(0, 3).join("; ")}${r.data.skipped.length > 3 ? "…" : ""})` : ""}.`)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
          >
            {pending ? "Working…" : places.some((p) => p.imported) ? "Refresh from current geography" : "Import from current geography"}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-400">Copies cities, zones, clusters and settlements from the existing app. Safe to run again: it updates names and parents and adds new places; sites made here are never touched.</p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-sm font-medium text-stone-900">Sites</p>
        <p className="mb-3 text-xs text-stone-500">A site is a building or point under a settlement — e.g. a creche. Efforts for site-level programmes sit on one.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_14rem_auto]">
          <PlacePicker places={places} levels={["settlement"]} value={settlementId} onChange={setSettlementId} placeholder="Settlement…" />
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site name, e.g. Creche 1" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none" />
          <button disabled={pending || !settlementId || !siteName.trim()} onClick={() => run(() => addSite({ settlementId, name: siteName }), () => { setSiteName(""); return "Site added."; })} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            Add site
          </button>
        </div>
        {sites.length > 0 && (
          <ul className="mt-3 divide-y divide-stone-50 text-sm">
            {sites.map((s) => <li key={s.id} className="py-1.5 text-stone-700">{s.path}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Partners ───────────────────────────────────────────────────────────────

type PartnerRow = { id: string; name: string; mis: string; active: boolean; imported: boolean; efforts: number };

export function PartnersPanel({ partners }: { partners: PartnerRow[] }) {
  const { pending, notice, run } = useAct();
  const [name, setName] = useState("");
  const [mis, setMis] = useState("");

  return (
    <div className="space-y-4">
      <Notice n={notice} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-stone-500">Partners never log in. Their own MIS is noted so RPs know where to read figures from.</p>
        <button disabled={pending} onClick={() => run(importPartnersAction, (r: { data: { added: number; updated: number } }) => `Imported: ${r.data.added} added, ${r.data.updated} updated.`)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40">
          Import from partner registry
        </button>
      </div>
      <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_12rem_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Partner name" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none" />
        <input value={mis} onChange={(e) => setMis(e.target.value)} placeholder="MIS, e.g. Frappe" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm outline-none" />
        <button disabled={pending || !name.trim()} onClick={() => run(() => savePartner({ name, mis }), () => { setName(""); setMis(""); return "Partner added."; })} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Add</button>
      </div>
      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {partners.map((p) => <PartnerLine key={p.id} p={p} />)}
        {!partners.length && <p className="px-4 py-6 text-center text-sm text-stone-500">No partners yet.</p>}
      </div>
    </div>
  );
}

function PartnerLine({ p }: { p: PartnerRow }) {
  const { pending, notice, run } = useAct();
  const [mis, setMis] = useState(p.mis);
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${p.active ? "text-stone-900" : "text-stone-400 line-through"}`}>{p.name}</p>
        <p className="text-xs text-stone-400">{p.efforts} effort{p.efforts === 1 ? "" : "s"}{p.imported ? " · from registry" : ""}</p>
        {notice?.tone === "err" && <p className="text-xs text-red-600">{notice.text}</p>}
      </div>
      <input value={mis} onChange={(e) => setMis(e.target.value)} onBlur={() => mis !== p.mis && run(() => savePartner({ id: p.id, name: p.name, mis }))} placeholder="MIS" className="w-32 rounded border border-transparent px-2 py-1 text-xs hover:border-stone-200 focus:border-stone-300 focus:outline-none" />
      <button disabled={pending} onClick={() => run(() => savePartner({ id: p.id, name: p.name, mis, active: !p.active }))} className="text-xs text-stone-500 hover:text-stone-800">{p.active ? "Deactivate" : "Activate"}</button>
    </div>
  );
}
