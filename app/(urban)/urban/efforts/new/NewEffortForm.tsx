"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createEffortAction, type FormState } from "../../actions";

export type ProgrammeOption = {
  id: string; name: string; level: string; partnerOptional: boolean;
  setupNew: number; setupRunning: number; routines: string[];
};
export type PlaceOption = { id: string; level: string; name: string; path: string };

const LEVEL_LABEL: Record<string, string> = { city: "city", zone: "zone", cluster: "cluster", settlement: "settlement", site: "site" };

export function NewEffortForm({
  programmes, places, partners, owners, defaultOwnerId, today, canAddSite,
}: {
  programmes: ProgrammeOption[];
  places: PlaceOption[];
  partners: { id: string; name: string; mis: string | null }[];
  owners: { id: string; label: string }[];
  defaultOwnerId: string;
  today: string;
  canAddSite: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createEffortAction, { error: null });
  const [programmeId, setProgrammeId] = useState(programmes[0]?.id ?? "");
  const [placeId, setPlaceId] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [startMode, setStartMode] = useState<"new" | "already_running">("new");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const programme = programmes.find((p) => p.id === programmeId);
  const levelPlaces = useMemo(() => places.filter((p) => p.level === programme?.level), [places, programme?.level]);
  const shown = useMemo(() => {
    const q = placeQuery.trim().toLowerCase();
    return (q ? levelPlaces.filter((p) => p.path.toLowerCase().includes(q)) : levelPlaces).slice(0, 60);
  }, [levelPlaces, placeQuery]);
  const place = places.find((p) => p.id === placeId);
  const partner = partners.find((p) => p.id === partnerId);

  // Suggest a name until the user types their own.
  const suggested = [programme?.name, place?.name, partner?.name ? `(${partner.name})` : ""].filter(Boolean).join(" – ").replace(" – (", " (");
  const effectiveTitle = titleTouched ? title : suggested;
  const setupCount = programme ? (startMode === "new" ? programme.setupNew : programme.setupRunning) : 0;

  if (!programmes.length) {
    return <p className="text-sm text-stone-500">No active programmes. <Link href="/urban/admin/programmes" className="underline">Add one first.</Link></p>;
  }

  return (
    <form action={action} className="space-y-5">
      <Field label="Programme">
        <select name="programmeId" value={programmeId} onChange={(e) => { setProgrammeId(e.target.value); setPlaceId(""); }} className="inp">
          {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {programme && (
          <p className="mt-1 text-xs text-stone-500">
            Sits at {LEVEL_LABEL[programme.level]} level
            {programme.routines.length ? ` · then ${programme.routines.join(", ")}` : " · setup only (a time-boxed drive)"}
          </p>
        )}
      </Field>

      <Field label="Starting">
        <div className="grid grid-cols-2 gap-2">
          {(["new", "already_running"] as const).map((m) => (
            <label key={m} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${startMode === m ? "border-stone-800 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700"}`}>
              <input type="radio" name="startMode" value={m} checked={startMode === m} onChange={() => setStartMode(m)} className="sr-only" />
              <span className="font-medium">{m === "new" ? "New" : "Already running"}</span>
              <span className={`block text-xs ${startMode === m ? "text-stone-300" : "text-stone-500"}`}>
                {programme ? `${m === "new" ? programme.setupNew : programme.setupRunning} setup items` : ""}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field label={`Place (${programme ? LEVEL_LABEL[programme.level] : ""})`}>
        <input type="hidden" name="placeId" value={placeId} />
        {place ? (
          <div className="flex items-center justify-between rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            <span className="truncate">{place.path}</span>
            <button type="button" onClick={() => setPlaceId("")} className="ml-3 shrink-0 text-xs text-stone-500 underline">change</button>
          </div>
        ) : (
          <div className="rounded-lg border border-stone-200 bg-white">
            <input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder={`Search ${levelPlaces.length} ${LEVEL_LABEL[programme?.level ?? ""]}s…`} className="w-full rounded-t-lg border-b border-stone-100 px-3 py-2 text-sm outline-none" />
            <ul className="max-h-56 overflow-y-auto">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPlaceId(p.id)} className="block w-full truncate px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-50">{p.path}</button>
                </li>
              ))}
              {!shown.length && (
                <li className="px-3 py-3 text-xs text-stone-500">
                  {levelPlaces.length ? "No match." : `No ${LEVEL_LABEL[programme?.level ?? ""]}s yet.`}
                  {programme?.level === "site" && canAddSite && <> Add a site under its settlement in <Link href="/urban/admin/people?tab=places" className="underline">People &amp; places</Link>.</>}
                </li>
              )}
            </ul>
          </div>
        )}
      </Field>

      <Field label={`Partner${programme?.partnerOptional ? " (optional)" : ""}`}>
        <select name="partnerId" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="inp">
          <option value="">{programme?.partnerOptional ? "No single partner (spans partners)" : "Pick a partner…"}</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.mis ? ` · ${p.mis}` : ""}</option>)}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Owner (RP)">
          <select name="ownerId" defaultValue={defaultOwnerId} className="inp">
            {owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" name="startedOn" defaultValue={today} className="inp" />
        </Field>
      </div>

      <Field label="Name">
        <input name="title" value={effectiveTitle} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} className="inp" />
      </Field>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500">{setupCount ? `${setupCount} setup tasks will be created, dated from the start date.` : "No setup — it goes straight to its routines."}</p>
        <button disabled={pending || !placeId} className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40">
          {pending ? "Creating…" : "Create effort"}
        </button>
      </div>

      <style>{`.inp{width:100%;border:1px solid rgb(214 211 209);border-radius:.5rem;padding:.5rem .75rem;font-size:.875rem;background:white;outline:none}.inp:focus{border-color:rgb(120 113 108)}`}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-stone-600">{label}</p>
      {children}
    </div>
  );
}
