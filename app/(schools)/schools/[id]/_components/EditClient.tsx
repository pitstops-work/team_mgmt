"use client";

import { useState, useTransition } from "react";
import {
  updatePlan, setPlanStatus, upsertSignoff, togglePublicSlug,
  addCatchment, updateCatchment, deleteCatchment,
  addSpace, updateSpace, deleteSpace,
  setServiceStatus, updateComponent,
  addStaffing, updateStaffing, deleteStaffing,
  addMilestone, updateMilestone, deleteMilestone,
  addRisk, updateRisk, deleteRisk,
} from "../../actions";
import type {
  SchoolPlanStepStatusValue,
  SchoolServiceStatusValue,
  SchoolComponentDeliveryValue,
  SchoolStaffPayrollValue,
  SchoolPlanStatusValue,
} from "@/lib/schoolPlan/types";

type PlanShape = Record<string, unknown> & {
  id: string;
  name: string;
  planStatus: SchoolPlanStatusValue;
};

type Settlement = { id: string; name: string; distanceMeters: number | null; walkMinutes: number | null; children0to3: number | null; children3to14: number | null; children14to18: number | null; existingServices: string | null };
type Space = { id: string; name: string; building: string | null; floor: string | null; sizeSqm: number | null; currentUse: string | null; proposedUse: string | null; capacityPerSession: number | null; sessionsPerDay: number | null; changesNeeded: string | null; structuralFlags: string | null };
type Service = { id: string; item: string; status: SchoolServiceStatusValue; details: string | null };
type Component = { id: string; component: string; offerText: string | null; deliveredBy: SchoolComponentDeliveryValue; schedule: string | null; childrenPerDay: number | null; planVetted: boolean; specialistPartnerId: string | null };
type Staffing = { id: string; role: string; count: number; payroll: SchoolStaffPayrollValue; status: string; notes: string | null };
type Milestone = { id: string; name: string; targetDate: string | null; dependsOn: string | null; status: string };
type Risk = { id: string; description: string; mitigation: string | null; ownerUserId: string | null; status: string };
type Signoff = { preparedAt: string | null; reviewedAt: string | null; approvedAt: string | null; reviewerNotes: string | null; approvalNotes: string | null } | null;

const TABS: { key: string; label: string }[] = [
  { key: "snapshot",   label: "Snapshot" },
  { key: "catchment",  label: "Catchment" },
  { key: "space",      label: "Space" },
  { key: "services",   label: "Services" },
  { key: "programme",  label: "Programme" },
  { key: "staffing",   label: "Staffing" },
  { key: "timeline",   label: "Timeline" },
  { key: "risks",      label: "Risks" },
  { key: "signoff",    label: "Sign-off" },
];

export default function EditClient(props: {
  plan: PlanShape;
  settlements: Settlement[];
  spaces: Space[];
  services: Service[];
  components: Component[];
  staffing: Staffing[];
  milestones: Milestone[];
  risks: Risk[];
  signoff: Signoff;
  users: { id: string; label: string }[];
  grantPartners: { id: string; label: string }[];
  canManageStructure: boolean;
  serviceItems: { key: string; label: string }[];
  componentDefs: { key: string; label: string; defaultDelivery: string }[];
}) {
  const [tab, setTab] = useState("snapshot");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
          {err} <button onClick={() => setErr(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full border ${tab === t.key ? "bg-[#1F3A5F] text-white border-[#1F3A5F]" : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
        {tab === "snapshot"  && <SnapshotForm plan={props.plan} users={props.users} grantPartners={props.grantPartners} onError={setErr} />}
        {tab === "catchment" && <CatchmentForm planId={props.plan.id} rows={props.settlements} onError={setErr} />}
        {tab === "space"     && <SpaceForm planId={props.plan.id} rows={props.spaces} onError={setErr} />}
        {tab === "services"  && <ServicesForm planId={props.plan.id} rows={props.services} items={props.serviceItems} onError={setErr} />}
        {tab === "programme" && <ProgrammeForm planId={props.plan.id} rows={props.components} defs={props.componentDefs} onError={setErr} />}
        {tab === "staffing"  && <StaffingForm planId={props.plan.id} rows={props.staffing} onError={setErr} />}
        {tab === "timeline"  && <TimelineForm planId={props.plan.id} rows={props.milestones} onError={setErr} />}
        {tab === "risks"     && <RisksForm planId={props.plan.id} rows={props.risks} users={props.users} onError={setErr} />}
        {tab === "signoff"   && <SignoffForm planId={props.plan.id} planStatus={props.plan.planStatus} row={props.signoff} publicSlug={(props.plan as unknown as { publicSlug?: string | null }).publicSlug ?? null} canManageStructure={props.canManageStructure} onError={setErr} />}
      </div>
    </div>
  );
}

// -------------------- Section: Snapshot --------------------

function SnapshotForm({ plan, users, grantPartners, onError }: { plan: PlanShape; users: { id: string; label: string }[]; grantPartners: { id: string; label: string }[]; onError: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<PlanShape>(plan);

  function bind<K extends keyof PlanShape>(key: K, type: "text" | "number" = "text") {
    return {
      value: type === "number"
        ? (state[key] === null || state[key] === undefined ? "" : String(state[key]))
        : ((state[key] ?? "") as string),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const raw = e.target.value;
        setState((s) => ({ ...s, [key]: type === "number" ? (raw === "" ? null : Number(raw)) : raw }));
      },
    };
  }

  function save() {
    startTransition(async () => {
      try { await updatePlan(plan.id, { ...state, id: undefined }); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Short name">    <input className={inputCls} {...bind("name")} /></Field>
        <Field label="Official name"> <input className={inputCls} {...bind("officialName")} /></Field>
        <Field label="DISE code">     <input className={inputCls} {...bind("diseCode")} /></Field>
        <Field label="School type">   <input className={inputCls} placeholder="model | urdu | composite" {...bind("schoolType")} /></Field>
        <Field label="Address">       <input className={inputCls} {...bind("addressText")} /></Field>
        <Field label="Ward">          <input className={inputCls} {...bind("ward")} /></Field>
        <Field label="Taluk">         <input className={inputCls} {...bind("taluk")} /></Field>
        <Field label="District">      <input className={inputCls} {...bind("district")} /></Field>
        <Field label="Year established"><input className={inputCls} type="number" {...bind("yearEstablished", "number")} /></Field>
        <Field label="Grades">        <input className={inputCls} {...bind("grades")} placeholder="e.g. 1-8" /></Field>
        <Field label="Sections">      <input className={inputCls} {...bind("sections")} /></Field>
        <Field label="Timings">       <input className={inputCls} {...bind("timings")} /></Field>
        <Field label="Shifts">        <input className={inputCls} {...bind("shifts")} /></Field>
        <Field label="Enrolment — boys"><input className={inputCls} type="number" {...bind("enrolmentBoys", "number")} /></Field>
        <Field label="Enrolment — girls"><input className={inputCls} type="number" {...bind("enrolmentGirls", "number")} /></Field>
        <Field label="Teachers sanctioned"><input className={inputCls} type="number" {...bind("teachersSanctioned", "number")} /></Field>
        <Field label="Teachers working"><input className={inputCls} type="number" {...bind("teachersWorking", "number")} /></Field>
        <Field label="Classrooms">    <input className={inputCls} type="number" {...bind("classroomsCount", "number")} /></Field>
        <Field label="Other rooms">   <input className={inputCls} type="number" {...bind("otherRoomsCount", "number")} /></Field>
        <Field label="Site (sq ft)">  <input className={inputCls} type="number" {...bind("siteAreaSqft", "number")} /></Field>
        <Field label="Built-up (sq ft)"><input className={inputCls} type="number" {...bind("builtupAreaSqft", "number")} /></Field>
        <Field label="Head teacher">  <input className={inputCls} {...bind("headTeacherName")} /></Field>
        <Field label="Head teacher phone"><input className={inputCls} {...bind("headTeacherPhone")} /></Field>
        <Field label="SDMC">          <input className={inputCls} {...bind("sdmcStatus")} /></Field>
        <Field label="Dept contact">  <input className={inputCls} {...bind("deptContactName")} /></Field>
        <Field label="Anchor partner (registry)">
          <select className={inputCls} {...bind("anchorPartnerId")}>
            <option value="">— pick from partners —</option>
            {grantPartners.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </Field>
        <Field label="Anchor partner (free-text fallback)"><input className={inputCls} {...bind("anchorPartnerName")} placeholder="Only if not in the partners registry" /></Field>
        <Field label="Latitude"> <input className={inputCls} type="number" step="0.000001" {...bind("geoLat", "number")} /></Field>
        <Field label="Longitude"><input className={inputCls} type="number" step="0.000001" {...bind("geoLng", "number")} /></Field>
        <Field label="Survey status">
          <select className={inputCls} {...bind("surveyStatus")}>
            <option value="">—</option>
            <option value="pending">pending</option>
            <option value="in_progress">in_progress</option>
            <option value="complete">complete</option>
          </select>
        </Field>
        <Field label="Target children/day"><input className={inputCls} type="number" {...bind("targetChildrenPerDay", "number")} /></Field>
        <Field label="Our lead">
          <select className={inputCls} {...bind("ourLeadUserId")}>
            <option value="">—</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="After-hours campus use"><textarea rows={2} className={inputCls} {...bind("campusAfterHoursUse")} /></Field>
      <Field label="Capacity read (paragraph)"><textarea rows={3} className={inputCls} {...bind("capacityRead")} /></Field>
      <Field label="Mobilisation notes"><textarea rows={2} className={inputCls} {...bind("mobilisationNotes")} /></Field>

      <div className="border-t border-stone-100 pt-3">
        <label className="flex items-center gap-2 text-xs text-stone-700">
          <input
            type="checkbox"
            checked={!!state["isInterimStructure"]}
            onChange={(e) => setState((s) => ({ ...s, isInterimStructure: e.target.checked }))}
          />
          <span>Interim structure — Directorate hasn't constructed the building yet (DJ Halli-style).</span>
        </label>
        {state["isInterimStructure"] ? (
          <Field label="Interim structure spec">
            <textarea rows={3} className={inputCls} {...bind("interimStructureSpec")} placeholder="Describe the interim structure that will be built in place of the school building." />
          </Field>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={pending} className="text-xs px-3 py-1.5 rounded-full bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50">Save snapshot</button>
      </div>
    </div>
  );
}

// -------------------- Section: Catchment --------------------

function CatchmentForm({ planId, rows, onError }: { planId: string; rows: Settlement[]; onError: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ name: "", distanceMeters: "", walkMinutes: "", children0to3: "", children3to14: "", children14to18: "", existingServices: "" });

  function add() {
    startTransition(async () => {
      try {
        await addCatchment(planId, {
          name: draft.name,
          distanceMeters: draft.distanceMeters ? Number(draft.distanceMeters) : null,
          walkMinutes: draft.walkMinutes ? Number(draft.walkMinutes) : null,
          children0to3: draft.children0to3 ? Number(draft.children0to3) : null,
          children3to14: draft.children3to14 ? Number(draft.children3to14) : null,
          children14to18: draft.children14to18 ? Number(draft.children14to18) : null,
          existingServices: draft.existingServices,
        });
        setDraft({ name: "", distanceMeters: "", walkMinutes: "", children0to3: "", children3to14: "", children14to18: "", existingServices: "" });
      } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function upd(id: string, patch: Record<string, unknown>) {
    startTransition(async () => {
      try { await updateCatchment(id, patch); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function del(id: string) {
    startTransition(async () => {
      try { await deleteCatchment(id); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">Settlements ({rows.length})</div>
      <table className="w-full text-xs">
        <thead className="text-stone-500 text-[10px]">
          <tr><th className="text-left">Name</th><th className="text-right">Dist (m)</th><th className="text-right">Walk (min)</th><th className="text-right">0–3</th><th className="text-right">3–14</th><th className="text-right">14–18</th><th className="text-left">Services</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-stone-100">
              <td><input defaultValue={s.name} className={cellCls} onBlur={(e) => upd(s.id, { name: e.target.value })} /></td>
              <td className="text-right"><input defaultValue={s.distanceMeters ?? ""} type="number" className={cellClsRight} onBlur={(e) => upd(s.id, { distanceMeters: e.target.value === "" ? null : Number(e.target.value) })} /></td>
              <td className="text-right"><input defaultValue={s.walkMinutes ?? ""} type="number" className={cellClsRight} onBlur={(e) => upd(s.id, { walkMinutes: e.target.value === "" ? null : Number(e.target.value) })} /></td>
              <td className="text-right"><input defaultValue={s.children0to3 ?? ""} type="number" className={cellClsRight} onBlur={(e) => upd(s.id, { children0to3: e.target.value === "" ? null : Number(e.target.value) })} /></td>
              <td className="text-right"><input defaultValue={s.children3to14 ?? ""} type="number" className={cellClsRight} onBlur={(e) => upd(s.id, { children3to14: e.target.value === "" ? null : Number(e.target.value) })} /></td>
              <td className="text-right"><input defaultValue={s.children14to18 ?? ""} type="number" className={cellClsRight} onBlur={(e) => upd(s.id, { children14to18: e.target.value === "" ? null : Number(e.target.value) })} /></td>
              <td><input defaultValue={s.existingServices ?? ""} className={cellCls} onBlur={(e) => upd(s.id, { existingServices: e.target.value })} /></td>
              <td><button onClick={() => del(s.id)} className="text-rose-600 hover:text-rose-800 text-[11px]">×</button></td>
            </tr>
          ))}
          <tr className="border-t-2 border-stone-200 bg-stone-50">
            <td><input placeholder="Add settlement" className={cellCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
            <td><input type="number" className={cellClsRight} value={draft.distanceMeters} onChange={(e) => setDraft({ ...draft, distanceMeters: e.target.value })} /></td>
            <td><input type="number" className={cellClsRight} value={draft.walkMinutes} onChange={(e) => setDraft({ ...draft, walkMinutes: e.target.value })} /></td>
            <td><input type="number" className={cellClsRight} value={draft.children0to3} onChange={(e) => setDraft({ ...draft, children0to3: e.target.value })} /></td>
            <td><input type="number" className={cellClsRight} value={draft.children3to14} onChange={(e) => setDraft({ ...draft, children3to14: e.target.value })} /></td>
            <td><input type="number" className={cellClsRight} value={draft.children14to18} onChange={(e) => setDraft({ ...draft, children14to18: e.target.value })} /></td>
            <td><input className={cellCls} value={draft.existingServices} onChange={(e) => setDraft({ ...draft, existingServices: e.target.value })} /></td>
            <td><button disabled={pending || !draft.name} onClick={add} className="text-sky-600 hover:text-sky-800 text-[11px] disabled:opacity-30">＋</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// -------------------- Section: Space --------------------

function SpaceForm({ planId, rows, onError }: { planId: string; rows: Space[]; onError: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ name: "", building: "", floor: "", sizeSqm: "", currentUse: "", proposedUse: "", capacityPerSession: "", sessionsPerDay: "1", changesNeeded: "", structuralFlags: "" });

  function add() {
    startTransition(async () => {
      try {
        await addSpace(planId, {
          name: draft.name, building: draft.building, floor: draft.floor,
          sizeSqm: draft.sizeSqm ? Number(draft.sizeSqm) : null,
          currentUse: draft.currentUse, proposedUse: draft.proposedUse,
          capacityPerSession: draft.capacityPerSession ? Number(draft.capacityPerSession) : null,
          sessionsPerDay: draft.sessionsPerDay ? Number(draft.sessionsPerDay) : 1,
          changesNeeded: draft.changesNeeded, structuralFlags: draft.structuralFlags,
        });
        setDraft({ name: "", building: "", floor: "", sizeSqm: "", currentUse: "", proposedUse: "", capacityPerSession: "", sessionsPerDay: "1", changesNeeded: "", structuralFlags: "" });
      } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function upd(id: string, patch: Record<string, unknown>) {
    startTransition(async () => {
      try { await updateSpace(id, patch); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function del(id: string) {
    startTransition(async () => {
      try { await deleteSpace(id); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">Spaces ({rows.length})</div>
      <div className="space-y-2">
        {rows.map((s) => (
          <div key={s.id} className="rounded-lg border border-stone-200 p-3 space-y-2 bg-stone-50/50">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Space name"><input defaultValue={s.name} className={inputCls} onBlur={(e) => upd(s.id, { name: e.target.value })} /></Field>
              <Field label="Building"><input defaultValue={s.building ?? ""} className={inputCls} onBlur={(e) => upd(s.id, { building: e.target.value })} /></Field>
              <Field label="Floor"><input defaultValue={s.floor ?? ""} className={inputCls} onBlur={(e) => upd(s.id, { floor: e.target.value })} /></Field>
              <Field label="Size (sqm)"><input defaultValue={s.sizeSqm ?? ""} type="number" step="0.01" className={inputCls} onBlur={(e) => upd(s.id, { sizeSqm: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              <Field label="Capacity / session"><input defaultValue={s.capacityPerSession ?? ""} type="number" className={inputCls} onBlur={(e) => upd(s.id, { capacityPerSession: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              <Field label="Sessions / day"><input defaultValue={s.sessionsPerDay ?? 1} type="number" className={inputCls} onBlur={(e) => upd(s.id, { sessionsPerDay: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              <Field label="Current use"><input defaultValue={s.currentUse ?? ""} className={inputCls} onBlur={(e) => upd(s.id, { currentUse: e.target.value })} /></Field>
              <Field label="Proposed use"><input defaultValue={s.proposedUse ?? ""} className={inputCls} onBlur={(e) => upd(s.id, { proposedUse: e.target.value })} /></Field>
              <div />
            </div>
            <Field label="Changes needed"><input defaultValue={s.changesNeeded ?? ""} className={inputCls} onBlur={(e) => upd(s.id, { changesNeeded: e.target.value })} /></Field>
            <Field label="Structural flags"><input defaultValue={s.structuralFlags ?? ""} className={inputCls} onBlur={(e) => upd(s.id, { structuralFlags: e.target.value })} /></Field>
            <div className="text-right"><button onClick={() => del(s.id)} className="text-rose-600 hover:text-rose-800 text-[11px]">Delete</button></div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border-2 border-dashed border-stone-200 p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-stone-400">Add space</div>
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Space name *" className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input placeholder="Building" className={inputCls} value={draft.building} onChange={(e) => setDraft({ ...draft, building: e.target.value })} />
          <input placeholder="Floor" className={inputCls} value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} />
          <input placeholder="Size (sqm)" type="number" step="0.01" className={inputCls} value={draft.sizeSqm} onChange={(e) => setDraft({ ...draft, sizeSqm: e.target.value })} />
          <input placeholder="Capacity/session" type="number" className={inputCls} value={draft.capacityPerSession} onChange={(e) => setDraft({ ...draft, capacityPerSession: e.target.value })} />
          <input placeholder="Sessions/day" type="number" className={inputCls} value={draft.sessionsPerDay} onChange={(e) => setDraft({ ...draft, sessionsPerDay: e.target.value })} />
        </div>
        <div className="text-right"><button disabled={pending || !draft.name} onClick={add} className="text-xs px-3 py-1.5 rounded-full bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50">Add</button></div>
      </div>
    </div>
  );
}

// -------------------- Section: Services --------------------

function ServicesForm({ planId, rows, items, onError }: {
  planId: string; rows: Service[]; items: { key: string; label: string }[]; onError: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const byKey = new Map(rows.map((r) => [r.item, r]));
  function set(item: string, status: SchoolServiceStatusValue, details?: string) {
    startTransition(async () => {
      try { await setServiceStatus(planId, item, status, details ?? byKey.get(item)?.details ?? null); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">Service checklist</div>
      <div className="space-y-1.5">
        {items.map((it) => {
          const row = byKey.get(it.key);
          const status = row?.status ?? "unknown";
          return (
            <div key={it.key} className="flex items-center gap-3 py-1">
              <span className="text-xs text-stone-800 flex-1">{it.label}</span>
              <select className={inputCls + " max-w-[110px]"} value={status} onChange={(e) => set(it.key, e.target.value as SchoolServiceStatusValue)} disabled={pending}>
                <option value="unknown">Unknown</option>
                <option value="ok">OK</option>
                <option value="gap">Gap</option>
              </select>
              <input
                className={inputCls + " flex-1 max-w-[280px]"}
                placeholder="Details…"
                defaultValue={row?.details ?? ""}
                onBlur={(e) => set(it.key, status, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------------------- Section: Programme components --------------------

function ProgrammeForm({ planId, rows, defs, onError }: {
  planId: string; rows: Component[]; defs: { key: string; label: string; defaultDelivery: string }[]; onError: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const byKey = new Map(rows.map((r) => [r.component, r]));
  function upd(key: string, patch: Record<string, unknown>) {
    startTransition(async () => {
      try { await updateComponent(planId, key, patch); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">Components</div>
      <div className="space-y-3">
        {defs.map((def) => {
          const r = byKey.get(def.key);
          if (!r) return null;
          return (
            <div key={def.key} className="rounded-lg border border-stone-200 p-3 space-y-2 bg-stone-50/50">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-stone-800">{def.label}</div>
                <label className="text-[11px] text-stone-600 flex items-center gap-1.5">
                  <input type="checkbox" defaultChecked={r.planVetted} onChange={(e) => upd(def.key, { planVetted: e.target.checked })} />
                  Plan vetted
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Field label="Delivered by">
                  <select className={inputCls} defaultValue={r.deliveredBy} onChange={(e) => upd(def.key, { deliveredBy: e.target.value as SchoolComponentDeliveryValue })}>
                    <option value="us">us</option>
                    <option value="anchor">anchor</option>
                    <option value="specialist">specialist</option>
                    <option value="agency">agency</option>
                  </select>
                </Field>
                <Field label="Schedule"><input defaultValue={r.schedule ?? ""} className={inputCls} onBlur={(e) => upd(def.key, { schedule: e.target.value })} /></Field>
                <Field label="Children/day"><input defaultValue={r.childrenPerDay ?? ""} type="number" className={inputCls} onBlur={(e) => upd(def.key, { childrenPerDay: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              </div>
              <Field label="Offer text"><textarea defaultValue={r.offerText ?? ""} rows={2} className={inputCls} onBlur={(e) => upd(def.key, { offerText: e.target.value })} /></Field>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------------------- Section: Staffing --------------------

function StaffingForm({ planId, rows, onError }: { planId: string; rows: Staffing[]; onError: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ role: "", count: "1", payroll: "us" as SchoolStaffPayrollValue, notes: "" });
  function add() {
    startTransition(async () => {
      try {
        await addStaffing(planId, { role: draft.role, count: Number(draft.count) || 0, payroll: draft.payroll, notes: draft.notes });
        setDraft({ role: "", count: "1", payroll: "us", notes: "" });
      } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function upd(id: string, patch: Record<string, unknown>) {
    startTransition(async () => {
      try { await updateStaffing(id, patch); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function del(id: string) {
    startTransition(async () => {
      try { await deleteStaffing(id); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">Staffing plan ({rows.length})</div>
      <table className="w-full text-xs">
        <thead className="text-stone-500 text-[10px]">
          <tr><th className="text-left">Role</th><th className="text-right">Count</th><th className="text-left">Payroll</th><th className="text-left">Status</th><th className="text-left">Notes</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-stone-100">
              <td><input defaultValue={r.role} className={cellCls} onBlur={(e) => upd(r.id, { role: e.target.value })} /></td>
              <td className="text-right"><input defaultValue={r.count} type="number" className={cellClsRight} onBlur={(e) => upd(r.id, { count: Number(e.target.value) || 0 })} /></td>
              <td>
                <select defaultValue={r.payroll} className={cellCls} onChange={(e) => upd(r.id, { payroll: e.target.value as SchoolStaffPayrollValue })}>
                  <option value="us">us</option><option value="anchor">anchor</option><option value="specialist">specialist</option><option value="agency">agency</option>
                </select>
              </td>
              <td>
                <select defaultValue={r.status} className={cellCls} onChange={(e) => upd(r.id, { status: e.target.value })}>
                  <option value="identified">identified</option><option value="hired">hired</option><option value="gap">gap</option>
                </select>
              </td>
              <td><input defaultValue={r.notes ?? ""} className={cellCls} onBlur={(e) => upd(r.id, { notes: e.target.value })} /></td>
              <td><button onClick={() => del(r.id)} className="text-rose-600 hover:text-rose-800 text-[11px]">×</button></td>
            </tr>
          ))}
          <tr className="border-t-2 border-stone-200 bg-stone-50">
            <td><input placeholder="Role" className={cellCls} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></td>
            <td><input type="number" className={cellClsRight} value={draft.count} onChange={(e) => setDraft({ ...draft, count: e.target.value })} /></td>
            <td>
              <select className={cellCls} value={draft.payroll} onChange={(e) => setDraft({ ...draft, payroll: e.target.value as SchoolStaffPayrollValue })}>
                <option value="us">us</option><option value="anchor">anchor</option><option value="specialist">specialist</option><option value="agency">agency</option>
              </select>
            </td>
            <td />
            <td><input placeholder="Notes" className={cellCls} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></td>
            <td><button disabled={pending || !draft.role} onClick={add} className="text-sky-600 hover:text-sky-800 text-[11px] disabled:opacity-30">＋</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// -------------------- Section: Timeline (milestones) --------------------

function TimelineForm({ planId, rows, onError }: { planId: string; rows: Milestone[]; onError: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ name: "", targetDate: "", dependsOn: "" });
  function add() {
    startTransition(async () => {
      try {
        await addMilestone(planId, { name: draft.name, targetDate: draft.targetDate || null, dependsOn: draft.dependsOn });
        setDraft({ name: "", targetDate: "", dependsOn: "" });
      } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function upd(id: string, patch: { name?: string; targetDate?: string | null; status?: string }) {
    startTransition(async () => {
      try { await updateMilestone(id, patch); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function del(id: string) {
    startTransition(async () => {
      try { await deleteMilestone(id); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">Milestones ({rows.length})</div>
      <table className="w-full text-xs">
        <thead className="text-stone-500 text-[10px]">
          <tr><th className="text-left">Milestone</th><th className="text-left">Target</th><th className="text-left">Status</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-stone-100">
              <td><input defaultValue={m.name} className={cellCls} onBlur={(e) => upd(m.id, { name: e.target.value })} /></td>
              <td><input type="date" defaultValue={m.targetDate ? m.targetDate.slice(0, 10) : ""} className={cellCls} onBlur={(e) => upd(m.id, { targetDate: e.target.value || null })} /></td>
              <td>
                <select defaultValue={m.status} className={cellCls} onChange={(e) => upd(m.id, { status: e.target.value })}>
                  <option value="pending">pending</option><option value="in_progress">in_progress</option><option value="done">done</option><option value="blocked">blocked</option>
                </select>
              </td>
              <td><button onClick={() => del(m.id)} className="text-rose-600 hover:text-rose-800 text-[11px]">×</button></td>
            </tr>
          ))}
          <tr className="border-t-2 border-stone-200 bg-stone-50">
            <td><input placeholder="Milestone" className={cellCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
            <td><input type="date" className={cellCls} value={draft.targetDate} onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })} /></td>
            <td />
            <td><button disabled={pending || !draft.name} onClick={add} className="text-sky-600 hover:text-sky-800 text-[11px] disabled:opacity-30">＋</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// -------------------- Section: Risks --------------------

function RisksForm({ planId, rows, users, onError }: { planId: string; rows: Risk[]; users: { id: string; label: string }[]; onError: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ description: "", mitigation: "", ownerUserId: "" });
  function add() {
    startTransition(async () => {
      try {
        await addRisk(planId, { description: draft.description, mitigation: draft.mitigation, ownerUserId: draft.ownerUserId || null });
        setDraft({ description: "", mitigation: "", ownerUserId: "" });
      } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function upd(id: string, patch: Record<string, unknown>) {
    startTransition(async () => {
      try { await updateRisk(id, patch); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function del(id: string) {
    startTransition(async () => {
      try { await deleteRisk(id); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">Risks ({rows.length})</div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-stone-200 p-3 space-y-2 bg-stone-50/50">
            <Field label="Description"><textarea defaultValue={r.description} rows={2} className={inputCls} onBlur={(e) => upd(r.id, { description: e.target.value })} /></Field>
            <Field label="Mitigation"><textarea defaultValue={r.mitigation ?? ""} rows={2} className={inputCls} onBlur={(e) => upd(r.id, { mitigation: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Owner">
                <select defaultValue={r.ownerUserId ?? ""} className={inputCls} onChange={(e) => upd(r.id, { ownerUserId: e.target.value || null })}>
                  <option value="">—</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select defaultValue={r.status} className={inputCls} onChange={(e) => upd(r.id, { status: e.target.value })}>
                  <option value="open">open</option>
                  <option value="mitigated">mitigated</option>
                  <option value="closed">closed</option>
                </select>
              </Field>
              <div className="flex items-end justify-end">
                <button onClick={() => del(r.id)} className="text-rose-600 hover:text-rose-800 text-[11px]">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border-2 border-dashed border-stone-200 p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-stone-400">Add risk</div>
        <textarea placeholder="Description *" rows={2} className={inputCls} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <textarea placeholder="Mitigation" rows={2} className={inputCls} value={draft.mitigation} onChange={(e) => setDraft({ ...draft, mitigation: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <select className={inputCls} value={draft.ownerUserId} onChange={(e) => setDraft({ ...draft, ownerUserId: e.target.value })}>
            <option value="">— Owner —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <div />
          <button disabled={pending || !draft.description} onClick={add} className="text-xs px-3 py-1.5 rounded-full bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  );
}

// -------------------- Section: Sign-off --------------------

function SignoffForm({ planId, planStatus, row, publicSlug, canManageStructure, onError }: {
  planId: string; planStatus: SchoolPlanStatusValue; row: Signoff;
  publicSlug: string | null; canManageStructure: boolean;
  onError: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [reviewer, setReviewer] = useState(row?.reviewerNotes ?? "");
  const [approval, setApproval] = useState(row?.approvalNotes ?? "");

  function mark(patch: Parameters<typeof upsertSignoff>[1]) {
    startTransition(async () => {
      try { await upsertSignoff(planId, patch); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }
  function moveStatus(next: SchoolPlanStatusValue) {
    startTransition(async () => {
      try { await setPlanStatus(planId, next); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">Plan status</div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-stone-500">Currently:</span> <b>{planStatus}</b>
        <button onClick={() => moveStatus("draft")}      className="ml-2 px-3 py-1 rounded-full border border-stone-200 hover:bg-stone-50">Move to draft</button>
        <button onClick={() => moveStatus("for_review")} className="px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100">Move to for-review</button>
        <button onClick={() => moveStatus("approved")}   className="px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100">Approve</button>
      </div>

      <div className="pt-2 border-t border-stone-200 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-stone-400">Signatures</div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-stone-500">Prepared</div>
            <div className="text-stone-800">{row?.preparedAt ? row.preparedAt.slice(0, 10) : "—"}</div>
            <button onClick={() => mark({ markPrepared: true })} disabled={pending} className="mt-1 text-[11px] text-sky-600 hover:text-sky-800">Mark now</button>
          </div>
          <div>
            <div className="text-stone-500">Reviewed</div>
            <div className="text-stone-800">{row?.reviewedAt ? row.reviewedAt.slice(0, 10) : "—"}</div>
            <button onClick={() => mark({ markReviewed: true, reviewerNotes: reviewer })} disabled={pending} className="mt-1 text-[11px] text-sky-600 hover:text-sky-800">Mark now</button>
          </div>
          <div>
            <div className="text-stone-500">Approved</div>
            <div className="text-stone-800">{row?.approvedAt ? row.approvedAt.slice(0, 10) : "—"}</div>
            <button onClick={() => mark({ markApproved: true, approvalNotes: approval })} disabled={pending} className="mt-1 text-[11px] text-sky-600 hover:text-sky-800">Mark now</button>
          </div>
        </div>
        <Field label="Reviewer notes"><textarea rows={2} className={inputCls} value={reviewer} onChange={(e) => setReviewer(e.target.value)} onBlur={() => mark({ reviewerNotes: reviewer })} /></Field>
        <Field label="Approval notes"><textarea rows={2} className={inputCls} value={approval} onChange={(e) => setApproval(e.target.value)} onBlur={() => mark({ approvalNotes: approval })} /></Field>
      </div>

      {canManageStructure && (
        <div className="pt-2 border-t border-stone-200 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-stone-400">Public read-only view</div>
          {publicSlug ? (
            <div className="flex items-center gap-2 text-xs">
              <a href={`/schools-public/${publicSlug}`} target="_blank" rel="noopener" className="text-emerald-700 hover:text-emerald-800">
                /schools-public/{publicSlug} ↗
              </a>
              <button
                onClick={() => startTransition(() => togglePublicSlug(planId, false).catch((e) => onError(e instanceof Error ? e.message : String(e))))}
                disabled={pending}
                className="ml-auto text-[11px] px-2 py-1 rounded-full border border-stone-200 hover:bg-stone-50"
              >Unpublish</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-500">Not published. Sensitive fields (budget, salaries, phones) will be redacted.</span>
              <button
                onClick={() => startTransition(() => togglePublicSlug(planId, true).catch((e) => onError(e instanceof Error ? e.message : String(e))))}
                disabled={pending}
                className="ml-auto text-[11px] px-2 py-1 rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
              >Publish public link</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------- Shared UI bits --------------------

const inputCls = "w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs";
const cellCls = "w-full rounded border border-stone-200 bg-white px-1.5 py-1 text-xs";
const cellClsRight = cellCls + " text-right";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-stone-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
