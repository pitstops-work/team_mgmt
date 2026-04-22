"use client";

import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronDown, Layers, ArrowRight, CalendarClock, AlertCircle } from "lucide-react";

// Sub-domains redirect to their parent programme
const SUB_DOMAIN_PARENT: Record<string, { label: string; templateId: string; programmeName: string }> = {
  YouthGroup:       { label: "Youth Groups",       templateId: "youth-resource-centre", programmeName: "Youth Resource Centre" },
  PalliativeSupport:{ label: "Palliative Support",  templateId: "elderly-centre",        programmeName: "Elderly Care Centre & Outreach" },
  ReferralSystem:   { label: "Referral System",     templateId: "elderly-centre",        programmeName: "Elderly Care Centre & Outreach" },
};

interface TemplateParameter {
  key: string;
  label: string;
  type: "number" | "text" | "choice";
  min?: number;
  max?: number;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  needsDomain: string | null;
  parameters: TemplateParameter[];
}

interface PreviewPitstop {
  title: string;
  type: string;
  notes: string;
  startSlaDays: number;
  slaDays: number;
  recurrence?: string;
  checklist: { text: string }[];
}

interface UserOption { id: string; name: string | null; image: string | null; designation?: string }

interface Props {
  onClose: () => void;
  onCreated: (goal: unknown) => void;
  // When opened from the needs dashboard — pre-selects the right template
  needsDomain?: string;
  needsSettlementId?: string;
  needsClusterId?: string;
  needsZoneId?: string;
  needsCityId?: string;
  geographyLabel?: string;
  // Current user context — drives owner picker visibility
  currentUserId?: string;
  currentUserDesignation?: string;
  allUsers?: UserOption[];
}

type Step = "pick" | "redirect" | "configure";

export default function TemplatePickerModal({
  onClose, onCreated,
  needsDomain, needsSettlementId, needsClusterId, needsZoneId, needsCityId, geographyLabel,
  currentUserId, currentUserDesignation, allUsers = [],
}: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [step, setStep] = useState<Step>("pick");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [targetDate, setTargetDate] = useState("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewPitstop[]>([]);
  const [expandedPreview, setExpandedPreview] = useState<Set<number>>(new Set());
  // activitySchedules: pitstop-index → ISO date string (YYYY-MM-DD)
  const [activitySchedules, setActivitySchedules] = useState<Record<number, string>>({});
  // Owner — ZL/PM can create goals on behalf of an RP
  const canPickOwner = ["ZL", "PM", "admin"].includes(currentUserDesignation ?? "");
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(currentUserId ?? "");
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");

  const subDomainInfo = needsDomain ? SUB_DOMAIN_PARENT[needsDomain] : null;

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((list: Template[]) => {
        setTemplates(list);

        if (needsDomain) {
          if (SUB_DOMAIN_PARENT[needsDomain]) {
            // Sub-domain — show redirect screen
            setStep("redirect");
            return;
          }
          // Find matching template and auto-select
          const match = list.find((t) => t.needsDomain === needsDomain);
          if (match) {
            selectTemplate(match);
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTemplate = (t: Template) => {
    setSelected(t);
    setTitle(t.name);
    const init: Record<string, string> = {};
    t.parameters.forEach((p) => { init[p.key] = ""; });
    setParamValues(init);
    setPreview([]);
    setStep("configure");
  };

  const buildParams = () => {
    const p: Record<string, string | number> = {};
    selected?.parameters.forEach((param) => {
      const v = paramValues[param.key];
      p[param.key] = param.type === "number" ? Number(v) || 0 : v;
    });
    return p;
  };

  const handlePreview = async () => {
    if (!selected) return;
    setPreviewing(true);
    try {
      const res = await fetch(`/api/templates/${selected.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: buildParams() }),
      });
      if (res.ok) {
        const pts: PreviewPitstop[] = await res.json();
        setPreview(pts);
        setActivitySchedules({});
      }
    } catch {
      // preview is optional
    } finally {
      setPreviewing(false);
    }
  };

  useEffect(() => {
    if (!selected || step !== "configure") return;
    const allFilled = selected.parameters.every((p) => paramValues[p.key] !== "");
    if (allFilled) handlePreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramValues, selected, step]);

  const slaWindowFor = (pt: PreviewPitstop) => {
    if (!startDate) return null;
    const base = new Date(startDate);
    const from = new Date(base); from.setDate(from.getDate() + pt.startSlaDays);
    const to   = new Date(base); to.setDate(to.getDate()   + pt.slaDays);
    return { from, to };
  };

  const isActivityDateValid = (idx: number) => {
    const pt = preview[idx];
    if (!pt || !activitySchedules[idx]) return false;
    const window = slaWindowFor(pt);
    if (!window) return true;
    const d = new Date(activitySchedules[idx]);
    return d >= window.from && d <= window.to;
  };

  const isValid = () => {
    if (!title.trim() || !startDate || !targetDate) return false;
    if (!selected) return false;
    const paramsOk = selected.parameters.every((p) => {
      const v = paramValues[p.key];
      if (!v) return false;
      if (p.type === "number") {
        const n = Number(v);
        if (isNaN(n) || n < (p.min ?? 1)) return false;
        if (p.max !== undefined && n > p.max) return false;
      }
      return true;
    });
    if (!paramsOk) return false;
    // All preview pitstops must have a valid activity date within their SLA window
    if (preview.length > 0) {
      for (let i = 0; i < preview.length; i++) {
        if (!isActivityDateValid(i)) return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid() || !selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/templates/${selected.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          startDate,
          targetDate,
          params: buildParams(),
          needsDomain: needsDomain ?? selected.needsDomain ?? null,
          needsSettlementId: needsSettlementId ?? null,
          needsClusterId: needsClusterId ?? null,
          needsZoneId: needsZoneId ?? null,
          needsCityId: needsCityId ?? null,
          activitySchedules,
          ...(canPickOwner && selectedOwnerId && selectedOwnerId !== currentUserId
            ? { ownerId: selectedOwnerId }
            : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      onCreated(await res.json());
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const togglePreviewExpand = (idx: number) => {
    setExpandedPreview((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Group templates by category for the pick step
  const byCategory = templates.reduce<Record<string, Template[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step === "configure" && !needsDomain && (
              <button onClick={() => setStep("pick")} className="text-stone-400 hover:text-stone-600 mr-1">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <Layers className="w-4 h-4 text-stone-400" />
            <div>
              <h2 className="text-base font-semibold text-stone-900 leading-tight">
                {step === "pick" ? "Create Goal from Template" : step === "redirect" ? "Programme Note" : selected?.name}
              </h2>
              {geographyLabel && (
                <p className="text-xs text-stone-400">{geographyLabel}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">

          {/* Sub-domain redirect */}
          {step === "redirect" && subDomainInfo && (
            <div className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-800 mb-1">
                  {subDomainInfo.label} is tracked within {subDomainInfo.programmeName}
                </p>
                <p className="text-xs text-stone-500 leading-relaxed max-w-sm">
                  This domain is managed as part of the {subDomainInfo.programmeName} programme goal.
                  Create or update a {subDomainInfo.programmeName} goal to manage this work.
                </p>
              </div>
              <button
                onClick={() => {
                  const match = templates.find((t) => t.id === subDomainInfo.templateId);
                  if (match) selectTemplate(match);
                }}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Create {subDomainInfo.programmeName} Goal
              </button>
            </div>
          )}

          {/* Template picker */}
          {step === "pick" && (
            <div className="p-6 space-y-5">
              {templates.length === 0 && (
                <p className="text-sm text-stone-400 text-center py-8">Loading templates…</p>
              )}
              {Object.entries(byCategory).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">{category}</p>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => selectTemplate(t)}
                        className="w-full text-left flex items-start gap-4 px-4 py-4 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-xl transition-all group"
                      >
                        <span className="text-2xl flex-shrink-0 mt-0.5">{t.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-900 mb-0.5">{t.name}</p>
                          <p className="text-xs text-stone-500 leading-relaxed">{t.description}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-500 flex-shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Configure */}
          {step === "configure" && selected && (
            <form id="template-form" onSubmit={handleSubmit} className="p-6 space-y-5">

              {/* Owner picker — ZL/PM creating on behalf of an RP */}
              {canPickOwner && allUsers.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <label className="block text-xs font-semibold text-amber-800 mb-1.5">Creating for</label>
                  <select
                    value={selectedOwnerId}
                    onChange={e => setSelectedOwnerId(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  >
                    <option value={currentUserId ?? ""}>Myself</option>
                    {allUsers
                      .filter(u => u.id !== currentUserId)
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name ?? u.id}{u.designation && u.designation !== "Other" ? ` (${u.designation})` : ""}
                        </option>
                      ))}
                  </select>
                  {selectedOwnerId && selectedOwnerId !== currentUserId && (
                    <p className="text-[11px] text-amber-700 mt-1.5">
                      Goal and pitstop ownership will be assigned to this person. You will be added as a follower.
                    </p>
                  )}
                </div>
              )}

              {/* Goal title */}
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Goal Title</label>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Name this goal"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Any extra context…"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent resize-none"
                />
              </div>

              {/* Parameters */}
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Setup Questions</p>
                <div className="space-y-4">
                  {selected.parameters.map((param) => (
                    <div key={param.key}>
                      <label className="block text-xs font-medium text-stone-600 mb-1.5">{param.label}</label>
                      {param.type === "choice" && param.options ? (
                        <div className="flex gap-2 flex-wrap">
                          {param.options.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setParamValues((prev) => ({ ...prev, [param.key]: opt.value }))}
                              className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                                paramValues[param.key] === opt.value
                                  ? "bg-sky-500 border-sky-500 text-white font-medium shadow-sm"
                                  : "bg-white border-stone-200 text-stone-600 hover:border-sky-300 hover:bg-sky-50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type={param.type === "number" ? "number" : "text"}
                          value={paramValues[param.key] ?? ""}
                          onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
                          placeholder={param.placeholder ?? ""}
                          min={param.min}
                          max={param.max}
                          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    Programme Start <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                  />
                  <p className="text-xs text-stone-400 mt-1">Pitstop dates are calculated from this.</p>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    Goal Deadline <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Pitstop preview */}
              {preview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                    Preview — {preview.length} pitstop{preview.length !== 1 ? "s" : ""} will be created
                  </p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {preview.map((pt, idx) => (
                      <div key={idx} className="border border-stone-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => togglePreviewExpand(idx)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-stone-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {pt.recurrence && pt.recurrence !== "None"
                              ? <span className="text-xs font-medium text-violet-500 flex-shrink-0">{pt.recurrence}</span>
                              : <span className="text-xs font-medium text-sky-600 flex-shrink-0">Day {pt.startSlaDays}–{pt.slaDays}</span>
                            }
                            <span className="text-xs font-medium text-stone-800 truncate">{pt.title}</span>
                            <span className="text-xs text-stone-400 flex-shrink-0">{pt.type}</span>
                          </div>
                          {expandedPreview.has(idx)
                            ? <ChevronDown className="w-3 h-3 text-stone-400 flex-shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-stone-400 flex-shrink-0" />
                          }
                        </button>
                        {expandedPreview.has(idx) && (
                          <div className="px-3 pb-3 bg-stone-50 border-t border-stone-100">
                            <p className="text-xs text-stone-600 mt-2 mb-2 leading-relaxed">{pt.notes}</p>
                            <ul className="space-y-1">
                              {pt.checklist.map((item, cIdx) => (
                                <li key={cIdx} className="flex items-start gap-1.5 text-xs text-stone-500">
                                  <span className="mt-0.5 w-3 h-3 border border-stone-300 rounded-sm flex-shrink-0" />
                                  {item.text}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity scheduling — required for each pitstop */}
              {preview.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <CalendarClock className="w-3.5 h-3.5 text-sky-500" />
                    <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">Schedule First Activity</p>
                  </div>
                  <p className="text-xs text-stone-400 mb-3 leading-relaxed">
                    Pick an activity date for each pitstop within its SLA window. This is required before creating the goal.
                  </p>
                  <div className="space-y-3">
                    {preview.map((pt, idx) => {
                      const window = slaWindowFor(pt);
                      const dateVal = activitySchedules[idx] ?? "";
                      const valid = !dateVal || isActivityDateValid(idx);
                      const fromStr = window ? window.from.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      const toStr   = window ? window.to.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      return (
                        <div key={idx} className={`rounded-lg border p-3 ${valid ? "border-stone-200 bg-stone-50" : "border-red-200 bg-red-50"}`}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-stone-800 truncate">{pt.title}</p>
                              {window && (
                                <p className="text-[11px] text-stone-400 mt-0.5">SLA window: {fromStr} – {toStr}</p>
                              )}
                            </div>
                            {dateVal && !valid && (
                              <div className="flex items-center gap-1 text-red-500 flex-shrink-0">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span className="text-[11px]">Outside window</span>
                              </div>
                            )}
                          </div>
                          <input
                            type="date"
                            value={dateVal}
                            min={window ? window.from.toISOString().split("T")[0] : undefined}
                            max={window ? window.to.toISOString().split("T")[0] : undefined}
                            onChange={(e) => setActivitySchedules(prev => ({ ...prev, [idx]: e.target.value }))}
                            className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${
                              valid
                                ? "border-stone-200 bg-white focus:ring-sky-400"
                                : "border-red-300 bg-white focus:ring-red-400"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {previewing && <p className="text-xs text-stone-400">Generating preview…</p>}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
          )}
        </div>

        {/* Footer */}
        {step === "configure" && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-100 flex-shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors">
              Cancel
            </button>
            <button
              form="template-form"
              type="submit"
              disabled={!isValid() || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Creating…" : "Create Goal"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
