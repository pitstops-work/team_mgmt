"use client";

import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronDown, Layers } from "lucide-react";

interface TemplateParameter {
  key: string;
  label: string;
  type: "number" | "text";
  min?: number;
  max?: number;
  placeholder?: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  parameters: TemplateParameter[];
}

interface PreviewPitstop {
  title: string;
  type: string;
  notes: string;
  startSlaDays: number;
  slaDays: number;
  checklist: { text: string }[];
}

interface Props {
  onClose: () => void;
  onCreated: (goal: unknown) => void;
}

type Step = "pick" | "configure";

export default function TemplatePickerModal({ onClose, onCreated }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [step, setStep] = useState<Step>("pick");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [targetDate, setTargetDate] = useState("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewPitstop[]>([]);
  const [expandedPreview, setExpandedPreview] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then(setTemplates)
      .catch(() => {});
  }, []);

  const handleSelectTemplate = (t: Template) => {
    setSelected(t);
    setTitle(`${t.name}`);
    // Initialize param values with empty strings
    const init: Record<string, string> = {};
    t.parameters.forEach((p) => { init[p.key] = ""; });
    setParamValues(init);
    setPreview([]);
    setStep("configure");
  };

  const handlePreview = async () => {
    if (!selected) return;
    setPreviewing(true);
    try {
      const params = buildParams();
      const res = await fetch(`/api/templates/${selected.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params }),
      });
      if (res.ok) {
        setPreview(await res.json());
      }
    } catch {
      // preview is optional — silent fail
    } finally {
      setPreviewing(false);
    }
  };

  const buildParams = () => {
    const p: Record<string, string | number> = {};
    selected?.parameters.forEach((param) => {
      const v = paramValues[param.key];
      p[param.key] = param.type === "number" ? Number(v) || 0 : v;
    });
    return p;
  };

  // Auto-preview when all params are filled
  useEffect(() => {
    if (!selected || step !== "configure") return;
    const allFilled = selected.parameters.every((p) => paramValues[p.key] !== "");
    if (allFilled) handlePreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramValues, selected, step]);

  const isValid = () => {
    if (!title.trim() || !startDate || !targetDate) return false;
    if (!selected) return false;
    return selected.parameters.every((p) => {
      const v = paramValues[p.key];
      if (!v) return false;
      if (p.type === "number") {
        const n = Number(v);
        if (isNaN(n) || n < (p.min ?? 1)) return false;
        if (p.max !== undefined && n > p.max) return false;
      }
      return true;
    });
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
        }),
      });
      if (!res.ok) throw new Error("Failed to create goal from template");
      const goal = await res.json();
      onCreated(goal);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const togglePreviewExpand = (idx: number) => {
    setExpandedPreview((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step === "configure" && (
              <button onClick={() => setStep("pick")} className="text-stone-400 hover:text-stone-600 mr-1">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <Layers className="w-4 h-4 text-stone-400" />
            <h2 className="text-base font-semibold text-stone-900">
              {step === "pick" ? "Choose a Template" : selected?.name}
            </h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {step === "pick" && (
            <div className="p-6 space-y-3">
              {templates.length === 0 && (
                <p className="text-sm text-stone-400 text-center py-8">Loading templates…</p>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className="w-full text-left flex items-start gap-4 px-4 py-4 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-xl transition-all group"
                >
                  <span className="text-2xl flex-shrink-0 mt-0.5">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-stone-900">{t.name}</p>
                      <span className="text-xs text-stone-400 bg-stone-200 px-2 py-0.5 rounded-full">{t.category}</span>
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed">{t.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-500 flex-shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}

          {step === "configure" && selected && (
            <form id="template-form" onSubmit={handleSubmit} className="p-6 space-y-5">
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

              {/* Template parameters */}
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Parameters</p>
                <div className="space-y-3">
                  {selected.parameters.map((param) => (
                    <div key={param.key}>
                      <label className="block text-xs font-medium text-stone-600 mb-1">{param.label}</label>
                      <input
                        type={param.type === "number" ? "number" : "text"}
                        value={paramValues[param.key] ?? ""}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))}
                        placeholder={param.placeholder ?? ""}
                        min={param.min}
                        max={param.max}
                        className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-stone-600 mb-1">
                    Program Start Date <span className="text-red-400">*</span>
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
                    Preview — {preview.length} Pitstops will be created
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
                            <span className="text-xs font-medium text-sky-600 flex-shrink-0">Day {pt.startSlaDays}–{pt.slaDays}</span>
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

              {previewing && (
                <p className="text-xs text-stone-400">Generating preview…</p>
              )}

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
              {loading ? "Creating…" : "Create Goal from Template"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
