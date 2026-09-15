"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { SeedingLeadStage } from "@/app/generated/prisma/client";
import { LEAD_STAGE_META, LEAD_STAGE_ORDER, CENTRAL_KEY, CENTRAL_LABEL } from "@/lib/seeding/outreach";
import { createSeedingLead, updateSeedingLead, setSeedingLeadStage, archiveSeedingLead, deleteSeedingLead } from "../actions";
import type { GeoOption } from "../_lib/scope";

type LeadRow = {
  id: string; geoId: string | null; name: string;
  phone: string | null; email: string | null; ageBand: string | null; occupation: string | null;
  theme: string | null; interestNote: string | null;
  stage: SeedingLeadStage; consented: boolean;
  channelId: string | null; channelName: string | null; sessionTitle: string | null;
  createdAtISO: string; editable: boolean;
};
type ChannelOpt = { id: string; geoId: string | null; name: string };

const inputCls = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";

export default function LeadRegister({
  geos, channels, leads, filters, writableGeoKeys, canHardDelete,
}: {
  geos: GeoOption[];
  channels: ChannelOpt[];
  leads: LeadRow[];
  filters: { geo: string; stage: string };
  writableGeoKeys: string[];
  canHardDelete: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      try { setErr(null); await fn(); after?.(); }
      catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/seeding/outreach/leads?${next.toString()}`);
  };

  const geoLabel = useMemo(() => new Map(geos.map((g) => [g.id ?? CENTRAL_KEY, g.label])), [geos]);
  const scopedGeo = geos.find((g) => (g.id ?? CENTRAL_KEY) === filters.geo || g.key === filters.geo)
    ?? geos.find((g) => writableGeoKeys.includes(g.key))
    ?? null;
  const canWriteScoped = !!scopedGeo && writableGeoKeys.includes(scopedGeo.key);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Named leads</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Warm, high-value people worth following up by name. This is a <strong>subset</strong> of the lead counts on
            the sessions — the funnel runs on those counts, so this register can stay small.
          </p>
        </div>
        <Link href="/seeding/outreach" className="text-xs text-sky-600 hover:underline">← Outreach overview</Link>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
        Personal data. Only the team for a geography can see its names, a phone number or email can only be saved once
        consent is recorded, and there is no bulk import or export. Keep it to people who agreed to hear from us.
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      <div className="rounded-xl border border-stone-200 bg-white p-3 flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-stone-500">Geography
          <select className={`${inputCls} mt-1 min-w-[180px]`} value={filters.geo} onChange={(e) => setParam("geo", e.target.value)}>
            <option value="">All I can see</option>
            {geos.map((g) => <option key={g.key} value={g.id ?? CENTRAL_KEY}>{g.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Stage
          <select className={`${inputCls} mt-1`} value={filters.stage} onChange={(e) => setParam("stage", e.target.value)}>
            <option value="">All stages</option>
            {LEAD_STAGE_ORDER.map((s) => <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>)}
          </select>
        </label>
        <div className="flex-1" />
        {canWriteScoped && (
          <button type="button" onClick={() => setAdding((v) => !v)}
            className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700">
            {adding ? "Cancel" : "+ Add lead"}
          </button>
        )}
      </div>

      {adding && scopedGeo && (
        <LeadForm
          title={`Add a lead — ${scopedGeo.label}`}
          channels={channels.filter((c) => c.geoId === scopedGeo.id)}
          pending={pending}
          onCancel={() => setAdding(false)}
          onSave={(input) => run(() => createSeedingLead(scopedGeo.id, input), () => setAdding(false))}
        />
      )}

      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">
          {leads.length} lead{leads.length === 1 ? "" : "s"}
        </div>
        <div className="divide-y divide-stone-100">
          {leads.length === 0 && (
            <div className="px-4 py-10 text-sm text-stone-400 text-center">
              No named leads yet — that&apos;s fine. Add one only when you intend to follow up personally.
            </div>
          )}
          {leads.map((l) => (
            <div key={l.id}>
              <div className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-stone-800 truncate">
                    {l.name}
                    {!l.consented && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">no consent recorded</span>}
                  </div>
                  <div className="text-[11px] text-stone-400 truncate">
                    {geoLabel.get(l.geoId ?? CENTRAL_KEY) ?? CENTRAL_LABEL}
                    {l.channelName ? ` · ${l.channelName}` : ""}
                    {l.sessionTitle ? ` · ${l.sessionTitle}` : ""}
                    {l.occupation ? ` · ${l.occupation}` : ""}
                    {l.theme ? ` · ${l.theme}` : ""}
                    {l.consented && (l.phone || l.email) ? ` · ${[l.phone, l.email].filter(Boolean).join(" · ")}` : ""}
                  </div>
                </div>
                {l.editable ? (
                  <select
                    className={`text-[11px] px-2 py-0.5 rounded-full border-0 ${LEAD_STAGE_META[l.stage].chip}`}
                    value={l.stage} disabled={pending}
                    onChange={(e) => run(() => setSeedingLeadStage(l.id, e.target.value as SeedingLeadStage))}
                  >
                    {LEAD_STAGE_ORDER.map((s) => <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>)}
                  </select>
                ) : (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${LEAD_STAGE_META[l.stage].chip}`}>{LEAD_STAGE_META[l.stage].label}</span>
                )}
                {l.editable && (
                  <button type="button" className="text-[11px] text-stone-500 hover:text-stone-800 shrink-0"
                    onClick={() => setEditingId(editingId === l.id ? null : l.id)}>Edit</button>
                )}
              </div>

              {editingId === l.id && (
                <div className="px-4 pb-3 bg-stone-50/60 border-t border-stone-100 pt-3 space-y-3">
                  <LeadForm
                    title="Edit lead"
                    initial={l}
                    channels={channels.filter((c) => c.geoId === l.geoId)}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSave={(input) => run(() => updateSeedingLead(l.id, input), () => setEditingId(null))}
                  />
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={pending} className="text-[11px] text-stone-500 hover:text-stone-800"
                      onClick={() => { if (confirm(`Archive ${l.name}?`)) run(() => archiveSeedingLead(l.id), () => setEditingId(null)); }}>
                      Archive
                    </button>
                    {canHardDelete && (
                      <button type="button" disabled={pending} className="text-[11px] text-rose-500 hover:text-rose-700"
                        onClick={() => { if (confirm(`Permanently delete ${l.name}? Use this for an erasure request — it cannot be undone.`)) run(() => deleteSeedingLead(l.id), () => setEditingId(null)); }}>
                        Delete permanently
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type LeadInputShape = Parameters<typeof createSeedingLead>[1];

function LeadForm({
  title, initial, channels, pending, onSave, onCancel,
}: {
  title: string;
  initial?: LeadRow;
  channels: ChannelOpt[];
  pending: boolean;
  onSave: (input: LeadInputShape) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [ageBand, setAgeBand] = useState(initial?.ageBand ?? "");
  const [occupation, setOccupation] = useState(initial?.occupation ?? "");
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [interestNote, setInterestNote] = useState(initial?.interestNote ?? "");
  const [channelId, setChannelId] = useState(initial?.channelId ?? "");
  const [consent, setConsent] = useState(initial?.consented ?? false);

  const needsConsent = !consent && (phone.trim() !== "" || email.trim() !== "");

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="text-sm font-medium text-stone-700">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-[11px] text-stone-500">Name *
          <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="text-[11px] text-stone-500">Phone
          <input className={`${inputCls} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Email
          <input className={`${inputCls} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Age band
          <input className={`${inputCls} mt-1`} value={ageBand} onChange={(e) => setAgeBand(e.target.value)} placeholder="22-25" />
        </label>
        <label className="text-[11px] text-stone-500">Occupation
          <input className={`${inputCls} mt-1`} value={occupation} onChange={(e) => setOccupation(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Theme
          <input className={`${inputCls} mt-1`} value={theme} onChange={(e) => setTheme(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500 sm:col-span-2">Came from
          <select className={`${inputCls} mt-1`} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">—</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500 flex items-end gap-2 pb-1.5">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="rounded" />
          <span>They agreed to be contacted</span>
        </label>
        <label className="text-[11px] text-stone-500 sm:col-span-3">What are they interested in?
          <textarea className={`${inputCls} mt-1`} rows={2} value={interestNote} onChange={(e) => setInterestNote(e.target.value)} />
        </label>
      </div>
      {needsConsent && (
        <div className="text-[11px] text-amber-700">
          Tick the consent box before saving a phone number or email — otherwise clear those fields.
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending || !name.trim() || needsConsent}
          onClick={() => onSave({ name, phone, email, ageBand, occupation, theme, interestNote, channelId: channelId || null, consentGiven: consent })}
          className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:bg-stone-300">Save</button>
        <button type="button" onClick={onCancel} className="text-xs text-stone-500 hover:text-stone-800">Cancel</button>
      </div>
    </div>
  );
}
