"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ChevronLeft, Plus, Trash2, ChevronUp, ChevronDown,
  GripVertical, Save, AlertTriangle, CheckCircle, ChevronRight,
} from "lucide-react";
import type { DbTemplate, DbPitstop, DbTemplateParam, DbActivity } from "@/lib/templateDb";
import { normalizeActivities, slugifyChecklistText } from "@/lib/templateDb";

// ── Types ────────────────────────────────────────────────────────────────────

const PITSTOP_TYPES = [
  "Meeting", "Training", "SiteVisit", "Discussion",
  "AppDevelopment", "Budgeting", "Proposal", "Research", "Review", "Custom", "Milestone",
];
const RECURRENCES = ["None", "Weekly", "Monthly", "Quarterly"];
const PROGRESS_TAGS = ["Planning", "Mobilisation", "Setup", "Capacity", "Engagement", "Delivery", "Monitoring"];
const PARAM_TYPES = ["number", "text", "choice"] as const;
const CATEGORIES = ["Community Programs", "Programmes", "Field Programmes", "Zonal Leadership"];
const COMPLETION_TYPES = [
  { value: "",         label: "Checkbox" },
  { value: "Activity", label: "Activity" },
  { value: "Voice",    label: "Voice note" },
  { value: "Upload",   label: "Upload" },
];

// ── Small helpers ────────────────────────────────────────────────────────────

function move<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  const [el] = out.splice(from, 1);
  out.splice(to, 0, el);
  return out;
}

function blankPitstop(): DbPitstop {
  return {
    title: "New Pitstop",
    type: "Meeting",
    notes: "",
    slaDays: 30,
    startSlaDays: 0,
    recurrence: "None",
    progressTag: undefined,
    checklist: [],
  };
}

function blankParam(): DbTemplateParam {
  return { key: "", label: "", type: "text" };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white";
const selectCls = inputCls;

// ── Param Editor ─────────────────────────────────────────────────────────────

function ParamEditor({
  param,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  param: DbTemplateParam;
  index: number;
  total: number;
  onChange: (p: DbTemplateParam) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const update = (patch: Partial<DbTemplateParam>) => onChange({ ...param, ...patch });

  return (
    <div className="border border-stone-200 rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-stone-300 shrink-0" />
        <span className="text-xs font-medium text-stone-600 flex-1">Param {index + 1}</span>
        <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 hover:bg-stone-100 rounded disabled:opacity-30">
          <ChevronUp className="w-3.5 h-3.5 text-stone-400" />
        </button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 hover:bg-stone-100 rounded disabled:opacity-30">
          <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
        </button>
        <button onClick={onRemove} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Key (used in {placeholders})">
          <input
            className={inputCls}
            value={param.key}
            onChange={(e) => update({ key: e.target.value.replace(/\s/g, "") })}
            placeholder="e.g. creches"
          />
        </Field>
        <Field label="Label (shown to user)">
          <input className={inputCls} value={param.label} onChange={(e) => update({ label: e.target.value })} placeholder="e.g. Number of creches" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Type">
          <select className={selectCls} value={param.type} onChange={(e) => update({ type: e.target.value as DbTemplateParam["type"] })}>
            {PARAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        {param.type === "number" && (
          <>
            <Field label="Min">
              <input type="number" className={inputCls} value={param.min ?? ""} onChange={(e) => update({ min: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="Max">
              <input type="number" className={inputCls} value={param.max ?? ""} onChange={(e) => update({ max: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
          </>
        )}
        {param.type === "text" && (
          <div className="col-span-2">
            <Field label="Placeholder">
              <input className={inputCls} value={param.placeholder ?? ""} onChange={(e) => update({ placeholder: e.target.value })} />
            </Field>
          </div>
        )}
      </div>

      {param.type === "choice" && (
        <Field label="Options (value | label, one per line)">
          <textarea
            rows={3}
            className={inputCls + " font-mono text-xs resize-none"}
            value={(param.options ?? []).map((o) => `${o.value} | ${o.label}`).join("\n")}
            onChange={(e) => {
              const options = e.target.value
                .split("\n")
                .map((line) => {
                  const [value, ...rest] = line.split("|").map((s) => s.trim());
                  return { value: value ?? "", label: (rest.join("|").trim() || value) ?? "" };
                })
                .filter((o) => o.value);
              update({ options });
            }}
            placeholder={"new | New programme\nexisting | Existing programme"}
          />
        </Field>
      )}
    </div>
  );
}

// ── Pitstop Editor ────────────────────────────────────────────────────────────

function PitstopEditor({
  pitstop,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  pitstop: DbPitstop;
  index: number;
  total: number;
  onChange: (p: DbPitstop) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const update = (patch: Partial<DbPitstop>) => onChange({ ...pitstop, ...patch });

  const addChecklistItem = () =>
    update({ checklist: [...pitstop.checklist, { text: "", activities: [] }] });

  const removeChecklistItem = (i: number) =>
    update({ checklist: pitstop.checklist.filter((_, idx) => idx !== i) });

  const updateChecklistItemText = (i: number, text: string) =>
    update({
      checklist: pitstop.checklist.map((item, idx) => idx === i ? { ...item, text } : item),
    });

  const updateChecklistItemKey = (i: number, key: string) =>
    update({
      checklist: pitstop.checklist.map((item, idx) => idx === i ? { ...item, key } : item),
    });

  const moveChecklistItem = (i: number, dir: -1 | 1) =>
    update({ checklist: move(pitstop.checklist, i, i + dir) });

  const addActivity = (itemIdx: number) =>
    update({
      checklist: pitstop.checklist.map((item, idx) => idx === itemIdx
        ? { ...item, activities: [...(item.activities ?? []), { title: "", completionType: "Activity" }] }
        : item),
    });

  const removeActivity = (itemIdx: number, actIdx: number) =>
    update({
      checklist: pitstop.checklist.map((item, idx) => idx === itemIdx
        ? { ...item, activities: (item.activities ?? []).filter((_, ai) => ai !== actIdx) }
        : item),
    });

  const updateActivity = (itemIdx: number, actIdx: number, patch: Partial<DbActivity>) =>
    update({
      checklist: pitstop.checklist.map((item, idx) => idx === itemIdx
        ? {
            ...item,
            activities: (item.activities ?? []).map((act, ai) => ai === actIdx ? { ...act, ...patch } : act),
          }
        : item),
    });

  return (
    <div className="border border-stone-200 rounded-xl bg-white overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-3">
        <GripVertical className="w-4 h-4 text-stone-300 shrink-0" />
        <button
          className="flex-1 text-left min-w-0"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-stone-800 truncate">{pitstop.title || "Untitled"}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded-full shrink-0">{pitstop.type}</span>
            {pitstop.recurrence && pitstop.recurrence !== "None" && (
              <span className="text-[10px] px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded-full shrink-0">{pitstop.recurrence}</span>
            )}
            <span className="text-xs text-stone-400 shrink-0 ml-auto">{pitstop.checklist.length} items</span>
          </div>
        </button>
        <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 hover:bg-stone-100 rounded disabled:opacity-30">
          <ChevronUp className="w-3.5 h-3.5 text-stone-400" />
        </button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 hover:bg-stone-100 rounded disabled:opacity-30">
          <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
        </button>
        <button onClick={onRemove} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setOpen((v) => !v)} className="p-1 hover:bg-stone-100 rounded">
          <ChevronRight className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-stone-100 px-4 pb-4 pt-3 space-y-4">
          {/* Title + Type row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Title">
                <input className={inputCls} value={pitstop.title} onChange={(e) => update({ title: e.target.value })} />
              </Field>
            </div>
            <Field label="Type">
              <select className={selectCls} value={pitstop.type} onChange={(e) => update({ type: e.target.value })}>
                {PITSTOP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          {/* SLA + Recurrence + Phase */}
          <div className="grid grid-cols-4 gap-3">
            <Field label="Start (days after goal start)">
              <input
                type="number"
                className={inputCls}
                value={pitstop.startSlaDays}
                onChange={(e) => update({ startSlaDays: Number(e.target.value) })}
              />
            </Field>
            <Field label="Target (days after goal start)">
              <input
                type="number"
                className={inputCls}
                value={pitstop.slaDays}
                onChange={(e) => update({ slaDays: Number(e.target.value) })}
              />
            </Field>
            <Field label="Recurrence">
              <select className={selectCls} value={pitstop.recurrence ?? "None"} onChange={(e) => update({ recurrence: e.target.value })}>
                {RECURRENCES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Phase tag">
              <select
                className={selectCls}
                value={pitstop.progressTag ?? ""}
                onChange={(e) => update({ progressTag: e.target.value || undefined })}
              >
                <option value="">(auto)</option>
                {PROGRESS_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          {/* Repeat count — only shown when recurring */}
          {pitstop.recurrence && pitstop.recurrence !== "None" && (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-sky-50 border border-sky-200 rounded-lg">
              <div className="flex-1">
                <Field label={`Repeat count — how many ${pitstop.recurrence.toLowerCase()} instances to generate`}>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    className={inputCls + " w-24"}
                    value={pitstop.repeatCount ?? 1}
                    onChange={(e) => update({ repeatCount: Math.max(1, Number(e.target.value)) })}
                  />
                </Field>
              </div>
              <p className="text-xs text-sky-600 max-w-xs self-end pb-1">
                {(pitstop.repeatCount ?? 1) > 1
                  ? `Creates ${pitstop.repeatCount} separate pitstops, each shifted by 1 ${pitstop.recurrence.toLowerCase().replace("ly", "")} period, labelled "Month 1", "Month 2"…`
                  : `Set to 2+ to generate multiple instances of this pitstop at this cadence.`}
              </p>
            </div>
          )}

          {/* Notes */}
          <Field label="Notes (supports {paramKey} placeholders)">
            <textarea
              rows={4}
              className={inputCls + " resize-y"}
              value={pitstop.notes}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </Field>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-500">Checklist items</span>
              <button
                onClick={addChecklistItem}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {pitstop.checklist.map((item, i) => {
                const activities = normalizeActivities(item);
                return (
                  <div key={i} className="border border-stone-200 rounded-lg bg-stone-50 p-2 space-y-2">
                    {/* Row: reorder + text + delete */}
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => moveChecklistItem(i, -1)} disabled={i === 0} className="p-0.5 hover:bg-stone-200 rounded disabled:opacity-30 shrink-0">
                        <ChevronUp className="w-3 h-3 text-stone-400" />
                      </button>
                      <button onClick={() => moveChecklistItem(i, 1)} disabled={i === pitstop.checklist.length - 1} className="p-0.5 hover:bg-stone-200 rounded disabled:opacity-30 shrink-0">
                        <ChevronDown className="w-3 h-3 text-stone-400" />
                      </button>
                      <input
                        className="flex-1 px-2.5 py-1 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
                        value={item.text}
                        onChange={(e) => updateChecklistItemText(i, e.target.value)}
                        placeholder="Checklist item text (supports {paramKey})"
                      />
                      <button onClick={() => removeChecklistItem(i)} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Stable key for indicator bindings */}
                    <div className="flex items-center gap-1.5 pl-10">
                      <span className="text-[10px] uppercase tracking-wider text-stone-400 shrink-0">Key</span>
                      <input
                        className="flex-1 px-2 py-0.5 text-[11px] font-mono border border-stone-200 rounded bg-white text-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-300"
                        value={item.key ?? ""}
                        onChange={(e) => updateChecklistItemKey(i, e.target.value)}
                        placeholder={slugifyChecklistText(item.text) || "auto-derived from text on save"}
                      />
                    </div>
                    {/* Activities sub-section */}
                    <div className="pl-6 border-l-2 border-stone-200 ml-4 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Activities</span>
                        <button
                          onClick={() => addActivity(i)}
                          className="flex items-center gap-0.5 text-[10px] text-stone-400 hover:text-stone-700 transition-colors"
                        >
                          <Plus className="w-2.5 h-2.5" /> Add
                        </button>
                      </div>
                      {activities.length === 0 && (
                        <p className="text-[11px] text-stone-300 italic">No activities — item completes as checkbox</p>
                      )}
                      {activities.map((act, ai) => (
                        <div key={ai} className="flex items-center gap-1.5">
                          <input
                            className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-stone-300"
                            value={act.title}
                            onChange={(e) => updateActivity(i, ai, { title: e.target.value })}
                            placeholder="Activity title (supports {paramKey})"
                          />
                          <select
                            className="px-1.5 py-1 text-xs border border-stone-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-stone-300 shrink-0"
                            value={act.completionType}
                            onChange={(e) => updateActivity(i, ai, { completionType: e.target.value })}
                          >
                            {COMPLETION_TYPES.filter(ct => ct.value !== "").map(ct => (
                              <option key={ct.value} value={ct.value}>{ct.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeActivity(i, ai)}
                            className="p-0.5 hover:bg-red-50 rounded text-stone-300 hover:text-red-400 transition-colors shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {pitstop.checklist.length === 0 && (
                <p className="text-xs text-stone-400 italic">No checklist items yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Editor Page ─────────────────────────────────────────────────────────

export default function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === "new";

  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super-admin";

  const [template, setTemplate] = useState<Partial<DbTemplate>>({
    slug: "",
    name: "",
    description: "",
    category: "Community Programs",
    icon: "🎯",
    needsDomain: undefined,
    linkedFacilityLayerKey: null,
    sortOrder: 99,
    parameters: [],
    pitstops: [],
    isActive: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [activeSection, setActiveSection] = useState<"info" | "params" | "pitstops">("info");
  const [needsDomains, setNeedsDomains] = useState<{ domain: string; label: string }[]>([]);
  const [facilityLayerOptions, setFacilityLayerOptions] = useState<{ value: string; label: string }[]>([
    { value: "", label: "None — no linked facility" },
  ]);

  useEffect(() => {
    fetch("/api/needs/formulas")
      .then(r => r.json())
      .then((rows: { domain: string; label: string }[]) => setNeedsDomains(rows))
      .catch(() => {});
    fetch("/api/admin/facility-layers")
      .then(r => r.json())
      .then((rows: { layerKey: string; label: string }[]) => {
        setFacilityLayerOptions([
          { value: "", label: "None — no linked facility" },
          ...rows.map(r => ({ value: r.layerKey, label: r.label })),
        ]);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    const res = await fetch(`/api/admin/templates/${id}`);
    if (res.ok) {
      const data = await res.json();
      // Normalize checklist items to new multi-activity format
      data.pitstops = (data.pitstops ?? []).map((pt: any) => ({
        ...pt,
        checklist: (pt.checklist ?? []).map((item: any) => {
          if (item.activities !== undefined) return item;
          const { activityTitle, completionType, ...rest } = item;
          return {
            ...rest,
            activities: activityTitle
              ? [{ title: activityTitle, completionType: completionType ?? "Activity" }]
              : [],
          };
        }),
      }));
      setTemplate(data);
    }
    setLoading(false);
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (session && !isAdmin) router.replace("/settings");
  }, [session, isAdmin, router]);

  if (!isAdmin) return null;

  const pitstops = (template.pitstops ?? []) as DbPitstop[];
  const parameters = (template.parameters ?? []) as DbTemplateParam[];

  const updatePitstop = (i: number, pt: DbPitstop) => {
    const next = [...pitstops];
    next[i] = pt;
    setTemplate((t) => ({ ...t, pitstops: next }));
  };

  const removePitstop = (i: number) =>
    setTemplate((t) => ({ ...t, pitstops: pitstops.filter((_, idx) => idx !== i) }));

  const movePitstop = (i: number, dir: -1 | 1) =>
    setTemplate((t) => ({ ...t, pitstops: move(pitstops, i, i + dir) }));

  const addPitstop = () =>
    setTemplate((t) => ({ ...t, pitstops: [...pitstops, blankPitstop()] }));

  const updateParam = (i: number, p: DbTemplateParam) => {
    const next = [...parameters];
    next[i] = p;
    setTemplate((t) => ({ ...t, parameters: next }));
  };

  const removeParam = (i: number) =>
    setTemplate((t) => ({ ...t, parameters: parameters.filter((_, idx) => idx !== i) }));

  const moveParam = (i: number, dir: -1 | 1) =>
    setTemplate((t) => ({ ...t, parameters: move(parameters, i, i + dir) }));

  const addParam = () =>
    setTemplate((t) => ({ ...t, parameters: [...parameters, blankParam()] }));

  const handleSave = async () => {
    setSaving(true);
    setStatus("idle");

    // Auto-fill missing checklist keys (slugify the text). Trim explicit keys.
    const payload = {
      ...template,
      pitstops: (template.pitstops ?? []).map((p) => ({
        ...p,
        checklist: p.checklist.map((item) => {
          const trimmed = (item.key ?? "").trim();
          return { ...item, key: trimmed || slugifyChecklistText(item.text) };
        }),
      })),
    };

    try {
      let res: Response;
      if (isNew) {
        res = await fetch("/api/admin/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/admin/templates/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 3000);
        if (isNew) {
          const data = await res.json();
          router.replace(`/settings/templates/${data.id}`);
        }
      } else {
        const data = await res.json();
        setErrorMsg(data.error ?? "Failed to save");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm("Deactivate this template? It will no longer appear in the goals modal. You can reactivate it later.")) return;
    await fetch(`/api/admin/templates/${id}`, { method: "DELETE" });
    router.push("/settings/templates");
  };

  const handlePermanentDelete = async () => {
    if (!confirm(`Permanently delete "${template.name}"?\n\nThis removes the template from the database entirely and cannot be undone.`)) return;
    await fetch(`/api/admin/templates/${id}?permanent=true`, { method: "DELETE" });
    router.push("/settings/templates");
  };

  const handleReactivate = async () => {
    setTemplate((t) => ({ ...t, isActive: true }));
    // Will be saved when user clicks Save
  };

  const TAB_CLS = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-stone-800 text-stone-900"
        : "border-transparent text-stone-500 hover:text-stone-700"
    }`;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-stone-400 text-center">Loading…</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings/templates" className="text-stone-400 hover:text-stone-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-stone-900 truncate">
            {isNew ? "New Template" : (template.name || "Edit Template")}
          </h1>
          {!isNew && template.slug && (
            <p className="text-xs text-stone-400 font-mono">{template.slug}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isNew && template.isActive && (
            <button
              onClick={handleDeactivate}
              className="px-3 py-1.5 text-xs border border-stone-200 text-stone-500 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
            >
              Deactivate
            </button>
          )}
          {!isNew && !template.isActive && (
            <button
              onClick={handleReactivate}
              className="px-3 py-1.5 text-xs border border-emerald-200 text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              Re-activate
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : status === "saved" ? (
              <CheckCircle className="w-4 h-4 text-emerald-300" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving…" : status === "saved" ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {status === "error" && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {!template.isActive && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          This template is inactive and will not appear in the goals modal. Click Re-activate and Save to restore it.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-stone-200 mb-6">
        <button className={TAB_CLS(activeSection === "info")} onClick={() => setActiveSection("info")}>
          Template Info
        </button>
        <button className={TAB_CLS(activeSection === "params")} onClick={() => setActiveSection("params")}>
          Parameters <span className="ml-1 text-xs text-stone-400">({parameters.length})</span>
        </button>
        <button className={TAB_CLS(activeSection === "pitstops")} onClick={() => setActiveSection("pitstops")}>
          Pitstops <span className="ml-1 text-xs text-stone-400">({pitstops.length})</span>
        </button>
      </div>

      {/* ── Info Tab ─────────────────────────────────────────────────────── */}
      {activeSection === "info" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Field label="Icon (emoji)">
              <input
                className={inputCls + " text-center text-xl"}
                value={template.icon ?? ""}
                onChange={(e) => setTemplate((t) => ({ ...t, icon: e.target.value }))}
                maxLength={4}
              />
            </Field>
            <div className="col-span-3">
              <Field label="Name">
                <input
                  className={inputCls}
                  value={template.name ?? ""}
                  onChange={(e) => setTemplate((t) => ({ ...t, name: e.target.value }))}
                  placeholder="e.g. Creche Programme"
                />
              </Field>
            </div>
          </div>

          <Field label="Description">
            <textarea
              rows={3}
              className={inputCls + " resize-y"}
              value={template.description ?? ""}
              onChange={(e) => setTemplate((t) => ({ ...t, description: e.target.value }))}
              placeholder="Short description shown in the goals modal."
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Category">
              <select
                className={selectCls}
                value={template.category ?? ""}
                onChange={(e) => setTemplate((t) => ({ ...t, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Needs Domain (optional)">
              <select
                className={selectCls}
                value={template.needsDomain ?? ""}
                onChange={(e) => setTemplate((t) => ({ ...t, needsDomain: e.target.value || undefined }))}
              >
                <option value="">— none —</option>
                {needsDomains.map(d => (
                  <option key={d.domain} value={d.domain}>{d.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                className={inputCls}
                value={template.sortOrder ?? 99}
                onChange={(e) => setTemplate((t) => ({ ...t, sortOrder: Number(e.target.value) }))}
              />
            </Field>
          </div>

          <Field label="Linked facility type">
            <select
              className={selectCls}
              value={template.linkedFacilityLayerKey ?? ""}
              onChange={(e) => setTemplate((t) => ({ ...t, linkedFacilityLayerKey: e.target.value || null }))}
            >
              {facilityLayerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-xs text-stone-400 mt-1">
              When set, the goal creation wizard shows a facility picker (from that layer) instead of asking &ldquo;Number of centres&rdquo;.
            </p>
          </Field>

          {isNew && (
            <Field label="Slug (URL-safe, unique ID)">
              <input
                className={inputCls + " font-mono"}
                value={template.slug ?? ""}
                onChange={(e) => setTemplate((t) => ({ ...t, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
                placeholder="e.g. creche-programme-new"
              />
              <p className="text-xs text-stone-400 mt-1">Cannot be changed after creation. Used as the template ID in the wizard.</p>
            </Field>
          )}
        </div>
      )}

      {/* ── Params Tab ───────────────────────────────────────────────────── */}
      {activeSection === "params" && (
        <div className="space-y-3">
          <p className="text-xs text-stone-400">
            Parameters appear as input fields when a user selects this template in the goal creation wizard.
            Use <code className="bg-stone-100 px-1 rounded">{"{key}"}</code> in pitstop notes / titles / checklist items to substitute the value.
          </p>

          {parameters.map((p, i) => (
            <ParamEditor
              key={i}
              param={p}
              index={i}
              total={parameters.length}
              onChange={(updated) => updateParam(i, updated)}
              onRemove={() => removeParam(i)}
              onMove={(dir) => moveParam(i, dir)}
            />
          ))}

          {parameters.length === 0 && (
            <p className="text-sm text-stone-400 italic text-center py-8">
              No parameters yet. Add one below.
            </p>
          )}

          <button
            onClick={addParam}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add parameter
          </button>
        </div>
      )}

      {/* ── Pitstops Tab ─────────────────────────────────────────────────── */}
      {activeSection === "pitstops" && (
        <div className="space-y-3">
          <p className="text-xs text-stone-400">
            Pitstops are created in this order when the template is applied.
            Use <code className="bg-stone-100 px-1 rounded">{"{paramKey}"}</code> in titles, notes, and checklist items to insert parameter values.
          </p>

          {pitstops.map((pt, i) => (
            <PitstopEditor
              key={i}
              pitstop={pt}
              index={i}
              total={pitstops.length}
              onChange={(updated) => updatePitstop(i, updated)}
              onRemove={() => removePitstop(i)}
              onMove={(dir) => movePitstop(i, dir)}
            />
          ))}

          {pitstops.length === 0 && (
            <p className="text-sm text-stone-400 italic text-center py-8">
              No pitstops yet. Add one below.
            </p>
          )}

          <button
            onClick={addPitstop}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add pitstop
          </button>
        </div>
      )}

      {/* Bottom bar */}
      <div className="mt-8 flex items-center justify-between pt-4 border-t border-stone-200">
        <Link href="/settings/templates" className="text-sm text-stone-400 hover:text-stone-600 transition-colors">
          ← Back to templates
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Danger zone — permanent delete */}
      {!isNew && (
        <div className="mt-10 pt-6 border-t border-red-100">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Danger zone</h3>
          <div className="flex items-center justify-between px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <div>
              <p className="text-sm font-medium text-red-700">Delete template permanently</p>
              <p className="text-xs text-red-400 mt-0.5">Removes the template from the database entirely. This cannot be undone.</p>
            </div>
            <button
              onClick={handlePermanentDelete}
              className="ml-4 shrink-0 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
