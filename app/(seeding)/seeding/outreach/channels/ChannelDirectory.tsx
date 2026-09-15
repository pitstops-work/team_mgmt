"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { SeedingChannelKind, SeedingChannelStage } from "@/app/generated/prisma/client";
import {
  CHANNEL_KIND_META, CHANNEL_KIND_ORDER,
  CHANNEL_STAGE_META, CHANNEL_STAGE_ORDER,
  CENTRAL_KEY, CENTRAL_LABEL,
} from "@/lib/seeding/outreach";
import { Chip } from "../../_components/bits";
import { createSeedingChannel, updateSeedingChannel, setSeedingChannelStage, archiveSeedingChannel } from "../actions";
import ChannelImport from "./ChannelImport";
import type { GeoOption } from "../_lib/scope";

export type ChannelRow = {
  id: string; geoId: string | null; subGeoId: string | null; subGeoLabel: string | null;
  kind: SeedingChannelKind; stage: SeedingChannelStage;
  name: string; nameKey: string;
  contactName: string | null; contactRole: string | null; contactPhone: string | null; contactEmail: string | null;
  externalCode: string | null; district: string | null; address: string | null; websiteUrl: string | null;
  estimatedReach: number | null; notes: string | null; source: string | null; ownerLabel: string | null;
  sessionsHeld: number; reachToDate: number; leadsToDate: number;
  editable: boolean;
};

type SubGeo = { id: string; geoId: string; label: string };

const nf = (n: number) => n.toLocaleString("en-IN");
const inputCls = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";

export default function ChannelDirectory({
  geos, subGeos, channels, filters, canEditFor, truncated,
}: {
  geos: GeoOption[];
  subGeos: SubGeo[];
  channels: ChannelRow[];
  filters: { geo: string; kind: string; stage: string; q: string };
  canEditFor: string[];
  truncated: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      try { setErr(null); await fn(); after?.(); }
      catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/seeding/outreach/channels?${next.toString()}`);
  };

  const geoLabel = useMemo(
    () => new Map(geos.map((g) => [g.id ?? CENTRAL_KEY, g.label])),
    [geos],
  );
  // The geo the add-form and the importer act on: whatever is filtered, else
  // the first one this user may write to.
  const scopedGeo = geos.find((g) => (g.id ?? CENTRAL_KEY) === filters.geo || g.key === filters.geo)
    ?? geos.find((g) => canEditFor.includes(g.key))
    ?? null;
  const canWriteScoped = !!scopedGeo && canEditFor.includes(scopedGeo.key);

  const byStage = CHANNEL_STAGE_ORDER.map((s) => ({ stage: s, count: channels.filter((c) => c.stage === s).length }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Outreach channels</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Every institution, alumni network, partner, forum and broadcast surface we can reach people through.
            Move a channel to <em>Agreed</em> or <em>Active</em> and it counts toward the funnel&apos;s channel target.
          </p>
        </div>
        <Link href="/seeding/outreach" className="text-xs text-sky-600 hover:underline">← Outreach overview</Link>
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      {/* Filters */}
      <div className="rounded-xl border border-stone-200 bg-white p-3 flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-stone-500">Geography
          <select className={`${inputCls} mt-1 min-w-[180px]`} value={filters.geo} onChange={(e) => setParam("geo", e.target.value)}>
            <option value="">All geographies</option>
            {geos.map((g) => <option key={g.key} value={g.id ?? CENTRAL_KEY}>{g.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Kind
          <select className={`${inputCls} mt-1`} value={filters.kind} onChange={(e) => setParam("kind", e.target.value)}>
            <option value="">All kinds</option>
            {CHANNEL_KIND_ORDER.map((k) => <option key={k} value={k}>{CHANNEL_KIND_META[k].label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Stage
          <select className={`${inputCls} mt-1`} value={filters.stage} onChange={(e) => setParam("stage", e.target.value)}>
            <option value="">All stages</option>
            {CHANNEL_STAGE_ORDER.map((s) => <option key={s} value={s}>{CHANNEL_STAGE_META[s].label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500 flex-1 min-w-[160px]">Search
          <input className={`${inputCls} mt-1`} defaultValue={filters.q} placeholder="Name contains…"
            onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value.trim()); }} />
        </label>
        {canWriteScoped && (
          <button type="button" onClick={() => setAdding((v) => !v)}
            className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700">
            {adding ? "Cancel" : "+ Add channel"}
          </button>
        )}
      </div>

      {/* Stage counts for the current filter */}
      <div className="flex flex-wrap gap-2">
        {byStage.map(({ stage, count }) => (
          <button key={stage} type="button" onClick={() => setParam("stage", filters.stage === stage ? "" : stage)}
            className={`text-[11px] px-2 py-1 rounded-full ${CHANNEL_STAGE_META[stage].chip} ${filters.stage === stage ? "ring-2 ring-stone-400" : ""}`}>
            {CHANNEL_STAGE_META[stage].label} · {count}
          </button>
        ))}
      </div>

      {adding && scopedGeo && (
        <ChannelForm
          title={`Add a channel — ${scopedGeo.label}`}
          subGeos={subGeos.filter((s) => s.geoId === scopedGeo.id)}
          pending={pending}
          onCancel={() => setAdding(false)}
          onSave={(input) => run(() => createSeedingChannel(scopedGeo.id, input), () => setAdding(false))}
        />
      )}

      {canWriteScoped && scopedGeo && (
        <ChannelImport
          geoId={scopedGeo.id}
          geoLabel={scopedGeo.label}
          existingKeys={channels.filter((c) => c.geoId === scopedGeo.id).map((c) => c.nameKey)}
          subGeoLabels={subGeos.filter((s) => s.geoId === scopedGeo.id).map((s) => s.label)}
        />
      )}

      {/* Directory */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">
          {channels.length} channel{channels.length === 1 ? "" : "s"}
          {truncated && <span className="ml-2 text-[11px] font-normal text-amber-600">showing the first 500 — narrow the filters</span>}
        </div>
        <div className="divide-y divide-stone-100">
          {channels.length === 0 && (
            <div className="px-4 py-10 text-sm text-stone-400 text-center">
              Nothing here yet. Add a channel, or paste a list from your spreadsheet.
            </div>
          )}
          {channels.map((c) => (
            <div key={c.id}>
              <div className="px-4 py-2.5 flex items-center gap-3">
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <div className="text-sm text-stone-800 truncate">{c.name}</div>
                  <div className="text-[11px] text-stone-400 truncate">
                    {CHANNEL_KIND_META[c.kind].label}
                    {" · "}{geoLabel.get(c.geoId ?? CENTRAL_KEY) ?? CENTRAL_LABEL}
                    {c.subGeoLabel ? ` · ${c.subGeoLabel}` : ""}
                    {c.contactName ? ` · ${c.contactName}` : ""}
                    {c.sessionsHeld > 0 ? ` · ${c.sessionsHeld} session${c.sessionsHeld === 1 ? "" : "s"}, ${nf(c.reachToDate)} reached` : ""}
                  </div>
                </button>
                {c.editable ? (
                  <select
                    className={`text-[11px] px-2 py-0.5 rounded-full border-0 ${CHANNEL_STAGE_META[c.stage].chip}`}
                    value={c.stage} disabled={pending}
                    onChange={(e) => run(() => setSeedingChannelStage(c.id, e.target.value as SeedingChannelStage))}
                  >
                    {CHANNEL_STAGE_ORDER.map((s) => <option key={s} value={s}>{CHANNEL_STAGE_META[s].label}</option>)}
                  </select>
                ) : <Chip meta={CHANNEL_STAGE_META[c.stage]} />}
              </div>

              {expanded === c.id && (
                <div className="px-4 pb-3 bg-stone-50/60 border-t border-stone-100">
                  {editingId === c.id ? (
                    <ChannelForm
                      title="Edit channel"
                      initial={c}
                      subGeos={subGeos.filter((s) => s.geoId === c.geoId)}
                      pending={pending}
                      onCancel={() => setEditingId(null)}
                      onSave={(input) => run(() => updateSeedingChannel(c.id, input), () => setEditingId(null))}
                    />
                  ) : (
                    <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[11px]">
                      <Field label="Contact" value={[c.contactName, c.contactRole].filter(Boolean).join(" · ") || null} />
                      <Field label="Phone" value={c.contactPhone} />
                      <Field label="Email" value={c.contactEmail} />
                      <Field label="Code" value={c.externalCode} />
                      <Field label="District" value={c.district} />
                      <Field label="Est. reach" value={c.estimatedReach ? nf(c.estimatedReach) : null} />
                      <Field label="Owner" value={c.ownerLabel} />
                      <Field label="Found via" value={c.source} />
                      {c.address && <div className="col-span-2 sm:col-span-4"><Field label="Address" value={c.address} /></div>}
                      {c.notes && <div className="col-span-2 sm:col-span-4"><Field label="Notes" value={c.notes} /></div>}
                      <div className="col-span-2 sm:col-span-4 flex items-center gap-3 pt-1">
                        <Link href={`/seeding/outreach/sessions?channel=${c.id}`} className="text-[11px] text-sky-600 hover:underline">
                          Sessions ({c.sessionsHeld} held · {nf(c.reachToDate)} reached · {nf(c.leadsToDate)} leads) →
                        </Link>
                        {c.websiteUrl && <a href={c.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-600 hover:underline">Website ↗</a>}
                        {c.editable && <>
                          <button type="button" className="text-[11px] text-stone-500 hover:text-stone-800" onClick={() => setEditingId(c.id)}>Edit</button>
                          <button type="button" disabled={pending} className="text-[11px] text-rose-500 hover:text-rose-700"
                            onClick={() => { if (confirm(`Archive "${c.name}"? Its logged sessions and their reach are kept.`)) run(() => archiveSeedingChannel(c.id)); }}>
                            Archive
                          </button>
                        </>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-stone-400">{label}</div>
      <div className="text-stone-700 break-words">{value ?? "—"}</div>
    </div>
  );
}

type FormInput = Parameters<typeof createSeedingChannel>[1];

function ChannelForm({
  title, initial, subGeos, pending, onSave, onCancel,
}: {
  title: string;
  initial?: ChannelRow;
  subGeos: SubGeo[];
  pending: boolean;
  onSave: (input: FormInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<SeedingChannelKind>(initial?.kind ?? "institution");
  const [subGeoId, setSubGeoId] = useState(initial?.subGeoId ?? "");
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [contactRole, setContactRole] = useState(initial?.contactRole ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");
  const [externalCode, setExternalCode] = useState(initial?.externalCode ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl ?? "");
  const [estimatedReach, setEstimatedReach] = useState(initial?.estimatedReach?.toString() ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name, kind,
      subGeoId: subGeoId || null,
      contactName, contactRole, contactPhone, contactEmail,
      externalCode, district, address, websiteUrl, source, notes,
      estimatedReach: estimatedReach ? parseInt(estimatedReach, 10) : null,
    });
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="text-sm font-medium text-stone-700">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-[11px] text-stone-500 sm:col-span-2">Name *
          <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="St. Joseph's College" />
        </label>
        <label className="text-[11px] text-stone-500">Kind *
          <select className={`${inputCls} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as SeedingChannelKind)}>
            {CHANNEL_KIND_ORDER.map((k) => <option key={k} value={k}>{CHANNEL_KIND_META[k].label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Sub-geography
          <select className={`${inputCls} mt-1`} value={subGeoId} onChange={(e) => setSubGeoId(e.target.value)}>
            <option value="">—</option>
            {subGeos.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Contact name
          <input className={`${inputCls} mt-1`} value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Contact role
          <input className={`${inputCls} mt-1`} value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="Placement officer" />
        </label>
        <label className="text-[11px] text-stone-500">Phone
          <input className={`${inputCls} mt-1`} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Email
          <input className={`${inputCls} mt-1`} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Code (AISHE / UDISE)
          <input className={`${inputCls} mt-1`} value={externalCode} onChange={(e) => setExternalCode(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">District
          <input className={`${inputCls} mt-1`} value={district} onChange={(e) => setDistrict(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Estimated reach
          <input type="number" className={`${inputCls} mt-1`} value={estimatedReach} onChange={(e) => setEstimatedReach(e.target.value)} placeholder="How many people could this put in a room?" />
        </label>
        <label className="text-[11px] text-stone-500">Website
          <input className={`${inputCls} mt-1`} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Found via
          <input className={`${inputCls} mt-1`} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Alumni intro, UDISE list…" />
        </label>
        <label className="text-[11px] text-stone-500 sm:col-span-3">Address
          <input className={`${inputCls} mt-1`} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500 sm:col-span-3">Notes
          <textarea className={`${inputCls} mt-1`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending || !name.trim()} onClick={submit}
          className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:bg-stone-300">Save</button>
        <button type="button" onClick={onCancel} className="text-xs text-stone-500 hover:text-stone-800">Cancel</button>
      </div>
    </div>
  );
}
