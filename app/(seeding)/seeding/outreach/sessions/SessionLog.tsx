"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { SeedingChannelStage, SeedingSessionKind, SeedingSessionStatus } from "@/app/generated/prisma/client";
import {
  SESSION_KIND_META, SESSION_KIND_ORDER,
  SESSION_STATUS_META, SESSION_STATUS_ORDER,
  CENTRAL_KEY, CENTRAL_LABEL,
} from "@/lib/seeding/outreach";
import { Chip } from "../../_components/bits";
import {
  createSeedingSession, updateSeedingSession, markSeedingSessionHeld,
  cancelSeedingSession, archiveSeedingSession,
} from "../actions";
import type { GeoOption } from "../_lib/scope";

type SessionRow = {
  id: string; geoId: string | null; subGeoId: string | null; subGeoLabel: string | null;
  channelId: string | null; channelName: string | null;
  kind: SeedingSessionKind; status: SeedingSessionStatus;
  title: string;
  scheduledAtISO: string; originalScheduledAtISO: string; heldAtISO: string | null;
  location: string | null; expectedReach: number | null;
  reachCount: number; leadsCaptured: number;
  notes: string | null; proofUrl: string | null; cancelledReason: string | null;
  ownerLabel: string | null; editable: boolean;
};
type ChannelOpt = { id: string; geoId: string | null; name: string; stage: SeedingChannelStage };
type SubGeo = { id: string; geoId: string; label: string };

const nf = (n: number) => n.toLocaleString("en-IN");
const inputCls = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const toDateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const monthKey = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export default function SessionLog({
  geos, channels, subGeos, sessions, filters, canEditFor,
}: {
  geos: GeoOption[];
  channels: ChannelOpt[];
  subGeos: SubGeo[];
  sessions: SessionRow[];
  filters: { geo: string; status: string; channel: string };
  canEditFor: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      try { setErr(null); await fn(); after?.(); }
      catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/seeding/outreach/sessions?${next.toString()}`);
  };

  const geoLabel = useMemo(() => new Map(geos.map((g) => [g.id ?? CENTRAL_KEY, g.label])), [geos]);
  const scopedGeo = geos.find((g) => (g.id ?? CENTRAL_KEY) === filters.geo || g.key === filters.geo)
    ?? geos.find((g) => canEditFor.includes(g.key))
    ?? null;
  const canWriteScoped = !!scopedGeo && canEditFor.includes(scopedGeo.key);

  // Group by month of the scheduled date, newest first.
  const months = useMemo(() => {
    const out: { label: string; rows: SessionRow[] }[] = [];
    for (const s of sessions) {
      const k = monthKey(s.scheduledAtISO);
      const last = out[out.length - 1];
      if (last?.label === k) last.rows.push(s);
      else out.push({ label: k, rows: [s] });
    }
    return out;
  }, [sessions]);

  const totals = {
    held: sessions.filter((s) => s.status === "held").length,
    planned: sessions.filter((s) => s.status === "planned").length,
    reach: sessions.reduce((n, s) => n + (s.status === "held" ? s.reachCount : 0), 0),
    leads: sessions.reduce((n, s) => n + (s.status === "held" ? s.leadsCaptured : 0), 0),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Sessions & events</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Every campus session, webinar, info desk and partner meeting. Marking one <em>held</em> with its reach and
            lead counts is what moves the funnel — a WhatsApp blast or mailer goes in as a <em>digital blast</em>.
          </p>
        </div>
        <Link href="/seeding/outreach" className="text-xs text-sky-600 hover:underline">← Outreach overview</Link>
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      <div className="rounded-xl border border-stone-200 bg-white p-3 flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-stone-500">Geography
          <select className={`${inputCls} mt-1 min-w-[180px]`} value={filters.geo} onChange={(e) => setParam("geo", e.target.value)}>
            <option value="">All geographies</option>
            {geos.map((g) => <option key={g.key} value={g.id ?? CENTRAL_KEY}>{g.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Status
          <select className={`${inputCls} mt-1`} value={filters.status} onChange={(e) => setParam("status", e.target.value)}>
            <option value="">All</option>
            {SESSION_STATUS_ORDER.map((s) => <option key={s} value={s}>{SESSION_STATUS_META[s].label}</option>)}
          </select>
        </label>
        {filters.channel && (
          <button type="button" onClick={() => setParam("channel", "")} className="text-[11px] text-sky-600 hover:underline pb-2">
            Clear channel filter
          </button>
        )}
        <div className="flex-1" />
        <div className="text-[11px] text-stone-500 pb-2">
          {totals.held} held · {totals.planned} planned · {nf(totals.reach)} reached · {nf(totals.leads)} leads
        </div>
        {canWriteScoped && (
          <button type="button" onClick={() => setAdding((v) => !v)}
            className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700">
            {adding ? "Cancel" : "+ Log a session"}
          </button>
        )}
      </div>

      {adding && scopedGeo && (
        <SessionForm
          title={`New session — ${scopedGeo.label}`}
          channels={channels.filter((c) => c.geoId === scopedGeo.id)}
          subGeos={subGeos.filter((s) => s.geoId === scopedGeo.id)}
          pending={pending}
          onCancel={() => setAdding(false)}
          onSave={(input) => run(() => createSeedingSession(scopedGeo.id, input), () => setAdding(false))}
        />
      )}

      {months.length === 0 && (
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-sm text-stone-400 text-center">
          No sessions logged yet. Everything in the funnel&apos;s reach and lead columns starts here.
        </div>
      )}

      {months.map((m) => (
        <div key={m.label} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">{m.label}</div>
          <div className="divide-y divide-stone-100">
            {m.rows.map((s) => {
              const slipped = s.status === "planned" && new Date(s.scheduledAtISO).getTime() < Date.now();
              const rescheduled = s.scheduledAtISO !== s.originalScheduledAtISO;
              return (
                <div key={s.id}>
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-stone-800 truncate">{s.title}</div>
                      <div className="text-[11px] text-stone-400 truncate">
                        {SESSION_KIND_META[s.kind].label}
                        {" · "}{geoLabel.get(s.geoId ?? CENTRAL_KEY) ?? CENTRAL_LABEL}
                        {s.subGeoLabel ? ` · ${s.subGeoLabel}` : ""}
                        {s.channelName ? ` · ${s.channelName}` : ""}
                        {" · "}{fmtDate(s.scheduledAtISO)}
                        {rescheduled && <span className="text-amber-600"> (moved from {fmtDate(s.originalScheduledAtISO)})</span>}
                        {s.status === "held" && ` · ${nf(s.reachCount)} reached, ${nf(s.leadsCaptured)} leads`}
                      </div>
                    </div>
                    {slipped && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Overdue</span>}
                    <Chip meta={SESSION_STATUS_META[s.status]} />
                    {s.editable && (
                      <div className="flex items-center gap-2 shrink-0">
                        {s.status !== "held" && (
                          <button type="button" className="text-[11px] text-emerald-600 hover:underline"
                            onClick={() => setHoldingId(holdingId === s.id ? null : s.id)}>
                            Mark held
                          </button>
                        )}
                        <button type="button" className="text-[11px] text-stone-500 hover:text-stone-800"
                          onClick={() => setEditingId(editingId === s.id ? null : s.id)}>Edit</button>
                      </div>
                    )}
                  </div>

                  {holdingId === s.id && (
                    <HeldForm
                      session={s}
                      pending={pending}
                      onCancel={() => setHoldingId(null)}
                      onSave={(input) => run(() => markSeedingSessionHeld(s.id, input), () => setHoldingId(null))}
                    />
                  )}

                  {editingId === s.id && (
                    <div className="px-4 pb-3 bg-stone-50/60 border-t border-stone-100 pt-3 space-y-3">
                      <SessionForm
                        title="Edit session"
                        initial={s}
                        channels={channels.filter((c) => c.geoId === s.geoId)}
                        subGeos={subGeos.filter((sg) => sg.geoId === s.geoId)}
                        pending={pending}
                        onCancel={() => setEditingId(null)}
                        onSave={(input) => run(() => updateSeedingSession(s.id, input), () => setEditingId(null))}
                      />
                      <div className="flex items-center gap-3">
                        {s.status !== "cancelled" && (
                          <button type="button" disabled={pending} className="text-[11px] text-amber-600 hover:underline"
                            onClick={() => {
                              const reason = prompt("Why was it cancelled?");
                              if (reason !== null) run(() => cancelSeedingSession(s.id, reason), () => setEditingId(null));
                            }}>Cancel session</button>
                        )}
                        <button type="button" disabled={pending} className="text-[11px] text-rose-500 hover:text-rose-700"
                          onClick={() => { if (confirm(`Archive "${s.title}"? Its reach comes back out of the funnel.`)) run(() => archiveSeedingSession(s.id), () => setEditingId(null)); }}>
                          Archive
                        </button>
                        {s.cancelledReason && <span className="text-[11px] text-stone-400">Cancelled: {s.cancelledReason}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type SessionInputShape = Parameters<typeof createSeedingSession>[1];

function SessionForm({
  title, initial, channels, subGeos, pending, onSave, onCancel,
}: {
  title: string;
  initial?: SessionRow;
  channels: ChannelOpt[];
  subGeos: SubGeo[];
  pending: boolean;
  onSave: (input: SessionInputShape) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<SeedingSessionKind>(initial?.kind ?? "campus_session");
  const [date, setDate] = useState(initial ? toDateInput(initial.scheduledAtISO) : new Date().toISOString().slice(0, 10));
  const [channelId, setChannelId] = useState(initial?.channelId ?? "");
  const [subGeoId, setSubGeoId] = useState(initial?.subGeoId ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [expectedReach, setExpectedReach] = useState(initial?.expectedReach?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const submit = () => {
    if (!name.trim() || !date) return;
    onSave({
      title: name, kind,
      scheduledAt: new Date(`${date}T00:00:00`),
      channelId: channelId || null,
      subGeoId: subGeoId || null,
      location, notes,
      expectedReach: expectedReach ? parseInt(expectedReach, 10) : null,
    });
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="text-sm font-medium text-stone-700">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-[11px] text-stone-500 sm:col-span-2">Title *
          <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Orientation talk, final-year students" />
        </label>
        <label className="text-[11px] text-stone-500">Kind *
          <select className={`${inputCls} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as SeedingSessionKind)}>
            {SESSION_KIND_ORDER.map((k) => <option key={k} value={k}>{SESSION_KIND_META[k].label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Date *
          <input type="date" className={`${inputCls} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Channel
          <select className={`${inputCls} mt-1`} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">— none (broadcast / off-book)</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Sub-geography
          <select className={`${inputCls} mt-1`} value={subGeoId} onChange={(e) => setSubGeoId(e.target.value)}>
            <option value="">—</option>
            {subGeos.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Location
          <input className={`${inputCls} mt-1`} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">Expected reach
          <input type="number" className={`${inputCls} mt-1`} value={expectedReach} onChange={(e) => setExpectedReach(e.target.value)} placeholder="Planning figure only" />
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

function HeldForm({
  session, pending, onSave, onCancel,
}: {
  session: SessionRow;
  pending: boolean;
  onSave: (input: { heldAt: Date; reachCount: number; leadsCaptured: number; notes: string; proofUrl: string }) => void;
  onCancel: () => void;
}) {
  const [heldAt, setHeldAt] = useState(toDateInput(session.heldAtISO ?? session.scheduledAtISO));
  const [reach, setReach] = useState(session.reachCount ? String(session.reachCount) : session.expectedReach ? String(session.expectedReach) : "");
  const [leads, setLeads] = useState(session.leadsCaptured ? String(session.leadsCaptured) : "");
  const [notes, setNotes] = useState(session.notes ?? "");
  const [proofUrl, setProofUrl] = useState(session.proofUrl ?? "");

  const reachNum = parseInt(reach, 10);
  const leadsNum = parseInt(leads, 10) || 0;
  const valid = !isNaN(reachNum) && reachNum > 0 && leadsNum <= reachNum;

  return (
    <div className="px-4 pb-3 pt-3 bg-emerald-50/50 border-t border-emerald-100 space-y-3">
      <div className="text-[11px] text-stone-600">
        These two numbers are what the funnel reads. Count people actually in the room or on the call —
        not the invite list.
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <label className="text-[11px] text-stone-500">Held on
          <input type="date" className={`${inputCls} mt-1`} value={heldAt} onChange={(e) => setHeldAt(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500">People reached *
          <input type="number" className={`${inputCls} mt-1 tabular-nums`} value={reach} onChange={(e) => setReach(e.target.value)} autoFocus />
        </label>
        <label className="text-[11px] text-stone-500">Leads captured
          <input type="number" className={`${inputCls} mt-1 tabular-nums`} value={leads} onChange={(e) => setLeads(e.target.value)} />
        </label>
        <label className="text-[11px] text-stone-500 sm:col-span-2">Proof (attendance sheet, photo, post)
          <input className={`${inputCls} mt-1`} value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label className="text-[11px] text-stone-500 col-span-2 sm:col-span-5">How did it go?
          <textarea className={`${inputCls} mt-1`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {!isNaN(leadsNum) && !isNaN(reachNum) && leadsNum > reachNum && (
        <div className="text-[11px] text-rose-600">Leads can&apos;t exceed the number of people reached.</div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending || !valid}
          onClick={() => onSave({ heldAt: new Date(`${heldAt}T00:00:00`), reachCount: reachNum, leadsCaptured: leadsNum, notes, proofUrl })}
          className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-600 disabled:bg-stone-300">
          Mark held
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-stone-500 hover:text-stone-800">Cancel</button>
      </div>
    </div>
  );
}
