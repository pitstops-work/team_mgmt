"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  compute, validateTemplate,
} from "@/lib/models/engine";
import type {
  DataType, Horizon, ModelGroup, ModelNode, ModelOutput, ModelTemplate, NodeKind, NodeShape, NodeValue, OutputKind,
} from "@/lib/models/types";
import { deleteTemplate, replaceTemplateContent, updateTemplateMeta } from "../actions";

type Tab = "nodes" | "outputs" | "horizons" | "groups" | "danger";

const KINDS: NodeKind[] = ["input", "formula", "constant"];
const DATATYPES: DataType[] = ["number", "percent", "currency", "int", "boolean", "enum"];
const OUTPUT_KINDS: OutputKind[] = ["kpi", "series", "seriesGroup", "table", "sensitivity", "scenarioGrid", "budgetExport"];

type EditableNode = ModelNode & { _id: string };
type EditableGroup = ModelGroup & { _id: string };
type EditableOutput = ModelOutput & { _id: string };

let _seq = 0;
const nextId = () => `tmp_${++_seq}`;

export default function TemplateEditor({
  templateId, templateKey, initial, canEdit,
}: {
  templateId: string; templateKey: string; initial: ModelTemplate; canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("nodes");
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [horizons, setHorizons] = useState<Horizon[]>(initial.horizons);
  const [groups, setGroups] = useState<EditableGroup[]>(
    initial.groups.map(g => ({ ...g, _id: nextId() })),
  );
  const [nodes, setNodes] = useState<EditableNode[]>(
    initial.nodes.map(n => ({ ...n, _id: nextId() })),
  );
  const [outputs, setOutputs] = useState<EditableOutput[]>(
    initial.outputs.map(o => ({ ...o, _id: nextId() })),
  );
  const [savePending, startSave] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Live engine view of current edits.
  const liveTemplate = useMemo<ModelTemplate>(() => ({
    key: templateKey, name, description, horizons,
    groups: groups.map(({ _id, ...g }) => g),
    nodes: nodes.map(({ _id, ...n }) => n),
    outputs: outputs.map(({ _id, ...o }) => o),
  }), [templateKey, name, description, horizons, groups, nodes, outputs]);

  const validation = useMemo(() => validateTemplate(liveTemplate), [liveTemplate]);
  const errorsByNode = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of validation) {
      const arr = map.get(e.nodeKey) ?? [];
      arr.push(e.message);
      map.set(e.nodeKey, arr);
    }
    return map;
  }, [validation]);

  const liveCompute = useMemo(() => {
    if (validation.length > 0) return null; // skip compute if static validation fails
    try { return compute(liveTemplate, {}); } catch { return null; }
  }, [liveTemplate, validation.length]);

  const dirty = useMemo(() => JSON.stringify(liveTemplate) !== JSON.stringify({ ...initial, key: templateKey }), [liveTemplate, initial, templateKey]);

  const save = () => {
    setSaveStatus("idle"); setSaveError(null);
    startSave(async () => {
      try {
        await updateTemplateMeta(templateId, { name, description, horizons });
        await replaceTemplateContent(templateId, {
          groups: groups.map(g => ({ key: g.key, label: g.label, order: g.order ?? 0 })),
          nodes: nodes.map(n => ({
            key: n.key, label: n.label, notes: n.notes ?? null, unit: n.unit ?? null,
            kind: n.kind, dataType: n.dataType, shape: n.shape, default: n.default,
            formula: n.formula ?? null, groupKey: n.groupKey ?? null, order: n.order ?? 0,
          })),
          outputs: outputs.map(o => ({
            key: o.key, label: o.label, kind: o.kind, config: o.config ?? {}, order: o.order ?? 0,
          })),
        });
        setSaveStatus("saved");
        router.refresh();
      } catch (e) {
        setSaveStatus("error");
        setSaveError((e as Error).message);
      }
    });
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white sticky top-0 z-10">
        <div className="px-6 py-4 flex items-baseline justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link href="/models/templates" className="text-xs text-stone-500 hover:underline">← Templates</Link>
              <span className="text-xs text-stone-300">·</span>
              <code className="text-xs text-stone-400">{templateKey}</code>
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!canEdit}
              className="text-xl font-semibold text-stone-900 bg-transparent outline-none w-full"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {validation.length > 0 && (
              <span className="text-xs text-amber-600">{validation.length} error{validation.length === 1 ? "" : "s"}</span>
            )}
            {saveStatus === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
            {saveStatus === "error" && <span className="text-xs text-rose-600">Save failed</span>}
            <button
              onClick={save}
              disabled={!canEdit || !dirty || savePending}
              className="text-sm bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50"
            >
              {savePending ? "Saving…" : dirty ? "Save changes" : "No changes"}
            </button>
          </div>
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={!canEdit}
          rows={1}
          placeholder="Description"
          className="px-6 pb-3 w-full text-sm text-stone-600 bg-transparent outline-none resize-none"
        />
        <div className="px-6 flex gap-1 border-t border-stone-100">
          {(["nodes", "outputs", "horizons", "groups", "danger"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm px-3 py-2 capitalize border-b-2 transition-colors ${
                tab === t ? "border-sky-600 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              {t}
              {t === "nodes" && ` (${nodes.length})`}
              {t === "outputs" && ` (${outputs.length})`}
            </button>
          ))}
        </div>
      </div>

      {saveError && (
        <div className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-sm">
          {saveError}
        </div>
      )}
      {validation.length > 0 && (
        <details className="px-6 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
          <summary className="cursor-pointer">{validation.length} validation error(s)</summary>
          <ul className="mt-2 space-y-0.5 pl-4 list-disc">
            {validation.slice(0, 20).map((e, i) => <li key={i}><code>{e.nodeKey}</code>: {e.message}</li>)}
            {validation.length > 20 && <li>… and {validation.length - 20} more</li>}
          </ul>
        </details>
      )}

      <div className="p-6">
        {tab === "nodes" && (
          <NodesEditor
            nodes={nodes} setNodes={setNodes}
            groups={groups} horizons={horizons}
            errorsByNode={errorsByNode} liveCompute={liveCompute}
            canEdit={canEdit}
          />
        )}
        {tab === "outputs" && (
          <OutputsEditor outputs={outputs} setOutputs={setOutputs} canEdit={canEdit} />
        )}
        {tab === "horizons" && (
          <HorizonsEditor horizons={horizons} setHorizons={setHorizons} canEdit={canEdit} />
        )}
        {tab === "groups" && (
          <GroupsEditor groups={groups} setGroups={setGroups} canEdit={canEdit} />
        )}
        {tab === "danger" && (
          <DangerZone templateId={templateId} canEdit={canEdit} />
        )}
      </div>
    </div>
  );
}

// ── Nodes editor ─────────────────────────────────────────────────────────────

function NodesEditor({
  nodes, setNodes, groups, horizons, errorsByNode, liveCompute, canEdit,
}: {
  nodes: EditableNode[]; setNodes: (n: EditableNode[]) => void;
  groups: EditableGroup[]; horizons: Horizon[];
  errorsByNode: Map<string, string[]>; liveCompute: { values: Record<string, NodeValue>; errors: Record<string, string> } | null;
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = filter.trim()
    ? nodes.filter(n => `${n.key} ${n.label} ${n.formula ?? ""}`.toLowerCase().includes(filter.toLowerCase()))
    : nodes;

  const updateNode = (id: string, patch: Partial<EditableNode>) => {
    setNodes(nodes.map(n => n._id === id ? { ...n, ...patch } : n));
  };
  const deleteNode = (id: string) => setNodes(nodes.filter(n => n._id !== id));
  const addNode = () => {
    const newNode: EditableNode = {
      _id: nextId(),
      key: `node_${nodes.length + 1}`, label: "New node",
      kind: "input", dataType: "number",
      shape: { kind: "scalar" }, default: 0,
      order: nodes.length,
      groupKey: groups[0]?.key ?? null,
    };
    setNodes([...nodes, newNode]);
    setExpanded(new Set([...expanded, newNode._id]));
  };

  const valueOf = (key: string): string => {
    if (!liveCompute) return "";
    if (liveCompute.errors[key]) return "ERR";
    const v = liveCompute.values[key];
    if (v === undefined) return "";
    if (Array.isArray(v)) return `[${v.slice(0, 3).map(x => typeof x === "number" ? Math.round(x).toLocaleString() : String(x)).join(", ")}${v.length > 3 ? ", …" : ""}]`;
    if (typeof v === "number") return Math.abs(v) >= 1000 ? v.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : v.toString();
    return String(v);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by key, label or formula…"
          className="flex-1 max-w-md px-3 py-1.5 text-sm border border-stone-200 rounded-md outline-none focus:border-sky-400"
        />
        <button
          onClick={addNode}
          disabled={!canEdit}
          className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-md hover:bg-stone-700 disabled:opacity-50"
        >
          + Add node
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {visible.map(n => {
          const errs = errorsByNode.get(n.key) ?? [];
          const isExpanded = expanded.has(n._id);
          return (
            <div key={n._id} className={`${errs.length ? "bg-amber-50/40" : ""}`}>
              <div className="grid grid-cols-12 gap-2 items-center px-4 py-2 text-sm">
                <input
                  value={n.key}
                  onChange={e => updateNode(n._id, { key: e.target.value })}
                  disabled={!canEdit}
                  className="col-span-2 font-mono text-xs px-2 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none"
                />
                <input
                  value={n.label}
                  onChange={e => updateNode(n._id, { label: e.target.value })}
                  disabled={!canEdit}
                  className="col-span-3 px-2 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none"
                />
                <select
                  value={n.kind}
                  onChange={e => updateNode(n._id, { kind: e.target.value as NodeKind })}
                  disabled={!canEdit}
                  className="col-span-1 text-xs px-1 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none"
                >
                  {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select
                  value={n.shape.kind === "scalar" ? "scalar" : `vec:${n.shape.horizon}`}
                  onChange={e => {
                    const v = e.target.value;
                    updateNode(n._id, { shape: v === "scalar" ? { kind: "scalar" } : { kind: "vector", horizon: v.slice(4) } });
                  }}
                  disabled={!canEdit}
                  className="col-span-2 text-xs px-1 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none"
                >
                  <option value="scalar">scalar</option>
                  {horizons.map(h => <option key={h.key} value={`vec:${h.key}`}>vec:{h.key}</option>)}
                </select>
                <div className="col-span-3 text-xs text-stone-500 font-mono truncate" title={valueOf(n.key)}>
                  {n.kind === "formula" ? (n.formula ?? "").slice(0, 50) : `= ${valueOf(n.key)}`}
                </div>
                <div className="col-span-1 flex justify-end gap-1">
                  <button
                    onClick={() => setExpanded(p => { const s = new Set(p); s.has(n._id) ? s.delete(n._id) : s.add(n._id); return s; })}
                    className="text-xs text-stone-400 hover:text-stone-700 px-1"
                    title={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? "−" : "▸"}
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete '${n.key}'?`)) deleteNode(n._id); }}
                    disabled={!canEdit}
                    className="text-xs text-rose-400 hover:text-rose-700 px-1 disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-3 grid grid-cols-12 gap-3">
                  <div className="col-span-6">
                    <label className="text-xs text-stone-500">Formula</label>
                    <textarea
                      value={n.formula ?? ""}
                      onChange={e => updateNode(n._id, { formula: e.target.value })}
                      disabled={!canEdit || n.kind !== "formula"}
                      rows={3}
                      placeholder={n.kind === "formula" ? "e.g. hh_count * adoption * price" : "—"}
                      className="mt-1 w-full px-2 py-1 text-xs font-mono border border-stone-200 rounded outline-none focus:border-sky-400 resize-y disabled:bg-stone-50 disabled:text-stone-400"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-stone-500">Data type</label>
                    <select
                      value={n.dataType}
                      onChange={e => updateNode(n._id, { dataType: e.target.value as DataType })}
                      disabled={!canEdit}
                      className="mt-1 w-full text-xs px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400"
                    >
                      {DATATYPES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <label className="text-xs text-stone-500 mt-2 block">Unit</label>
                    <input
                      value={n.unit ?? ""}
                      onChange={e => updateNode(n._id, { unit: e.target.value || null })}
                      disabled={!canEdit}
                      className="mt-1 w-full text-xs px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-stone-500">Group</label>
                    <select
                      value={n.groupKey ?? ""}
                      onChange={e => updateNode(n._id, { groupKey: e.target.value || null })}
                      disabled={!canEdit}
                      className="mt-1 w-full text-xs px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400"
                    >
                      <option value="">(none)</option>
                      {groups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                    </select>
                    <label className="text-xs text-stone-500 mt-2 block">Order</label>
                    <input
                      type="number"
                      value={n.order ?? 0}
                      onChange={e => updateNode(n._id, { order: Number(e.target.value) })}
                      disabled={!canEdit}
                      className="mt-1 w-full text-xs px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-stone-500">Default value</label>
                    <input
                      value={n.default === undefined || n.default === null ? "" : String(n.default)}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === "") { updateNode(n._id, { default: undefined }); return; }
                        const num = Number(v);
                        updateNode(n._id, { default: Number.isFinite(num) ? num : v });
                      }}
                      disabled={!canEdit || n.kind === "formula"}
                      className="mt-1 w-full text-xs px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400 disabled:bg-stone-50 disabled:text-stone-400"
                    />
                    {liveCompute && !errs.length && (
                      <div className="mt-2 text-xs text-stone-500">
                        <span className="text-stone-400">computed:</span> {valueOf(n.key)}
                      </div>
                    )}
                  </div>
                  <div className="col-span-12">
                    <label className="text-xs text-stone-500">Notes</label>
                    <textarea
                      value={n.notes ?? ""}
                      onChange={e => updateNode(n._id, { notes: e.target.value || null })}
                      disabled={!canEdit}
                      rows={1}
                      className="mt-1 w-full text-xs px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400 resize-y"
                    />
                  </div>
                  {errs.length > 0 && (
                    <div className="col-span-12 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                      {errs.map((e, i) => <div key={i}>· {e}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="text-center text-stone-400 text-sm py-12">
          {filter ? "No nodes match filter." : "No nodes yet."}
        </div>
      )}
    </div>
  );
}

// ── Outputs editor ──────────────────────────────────────────────────────────

function OutputsEditor({
  outputs, setOutputs, canEdit,
}: {
  outputs: EditableOutput[]; setOutputs: (o: EditableOutput[]) => void; canEdit: boolean;
}) {
  const update = (id: string, patch: Partial<EditableOutput>) =>
    setOutputs(outputs.map(o => o._id === id ? { ...o, ...patch } : o));
  const remove = (id: string) => setOutputs(outputs.filter(o => o._id !== id));
  const add = () => setOutputs([...outputs, {
    _id: nextId(), key: `output_${outputs.length + 1}`, label: "New output",
    kind: "kpi", config: {}, order: outputs.length,
  }]);

  return (
    <div>
      <div className="flex justify-between mb-3">
        <p className="text-sm text-stone-500">Outputs render in the play surface (KPI cards, charts, sensitivity grids).</p>
        <button onClick={add} disabled={!canEdit} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-md hover:bg-stone-700 disabled:opacity-50">
          + Add output
        </button>
      </div>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {outputs.map(o => (
          <div key={o._id} className="px-4 py-3 grid grid-cols-12 gap-2 items-start text-sm">
            <input value={o.key} onChange={e => update(o._id, { key: e.target.value })} disabled={!canEdit}
              className="col-span-2 font-mono text-xs px-2 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none" />
            <input value={o.label} onChange={e => update(o._id, { label: e.target.value })} disabled={!canEdit}
              className="col-span-3 px-2 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none" />
            <select value={o.kind} onChange={e => update(o._id, { kind: e.target.value as OutputKind })} disabled={!canEdit}
              className="col-span-2 text-xs px-1 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none">
              {OUTPUT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <textarea
              value={JSON.stringify(o.config, null, 2)}
              onChange={e => {
                try { update(o._id, { config: JSON.parse(e.target.value) }); }
                catch { /* keep typing */ }
              }}
              disabled={!canEdit}
              rows={3}
              className="col-span-4 text-xs font-mono px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400 resize-y"
            />
            <div className="col-span-1 flex justify-end">
              <button onClick={() => { if (confirm(`Delete '${o.key}'?`)) remove(o._id); }} disabled={!canEdit}
                className="text-xs text-rose-400 hover:text-rose-700 disabled:opacity-30">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Horizons editor ─────────────────────────────────────────────────────────

function HorizonsEditor({
  horizons, setHorizons, canEdit,
}: {
  horizons: Horizon[]; setHorizons: (h: Horizon[]) => void; canEdit: boolean;
}) {
  return (
    <div className="max-w-xl">
      <p className="text-sm text-stone-500 mb-3">
        Time bases this template uses. Each vector node binds to one of these. Renaming a key will break any nodes that reference it; deleting the same.
      </p>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {horizons.map((h, i) => (
          <div key={i} className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-sm">
            <input value={h.key} onChange={e => setHorizons(horizons.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} disabled={!canEdit}
              className="col-span-5 font-mono text-xs px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400" />
            <input type="number" value={h.length} onChange={e => setHorizons(horizons.map((x, j) => j === i ? { ...x, length: Number(e.target.value) || 0 } : x))} disabled={!canEdit}
              className="col-span-5 text-xs px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400" />
            <span className="col-span-1 text-xs text-stone-400">periods</span>
            <button onClick={() => setHorizons(horizons.filter((_, j) => j !== i))} disabled={!canEdit}
              className="col-span-1 text-xs text-rose-400 hover:text-rose-700 disabled:opacity-30">×</button>
          </div>
        ))}
      </div>
      <button onClick={() => setHorizons([...horizons, { key: `horizon_${horizons.length + 1}`, length: 12 }])} disabled={!canEdit}
        className="mt-3 text-sm bg-stone-900 text-white px-3 py-1.5 rounded-md hover:bg-stone-700 disabled:opacity-50">
        + Add horizon
      </button>
    </div>
  );
}

// ── Groups editor ───────────────────────────────────────────────────────────

function GroupsEditor({
  groups, setGroups, canEdit,
}: {
  groups: EditableGroup[]; setGroups: (g: EditableGroup[]) => void; canEdit: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm text-stone-500 mb-3">UI grouping for inputs in the play surface.</p>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {groups.map(g => (
          <div key={g._id} className="px-4 py-2 grid grid-cols-12 gap-2 items-center text-sm">
            <input value={g.key} onChange={e => setGroups(groups.map(x => x._id === g._id ? { ...x, key: e.target.value } : x))} disabled={!canEdit}
              className="col-span-3 font-mono text-xs px-2 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none" />
            <input value={g.label} onChange={e => setGroups(groups.map(x => x._id === g._id ? { ...x, label: e.target.value } : x))} disabled={!canEdit}
              className="col-span-7 px-2 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none" />
            <input type="number" value={g.order ?? 0} onChange={e => setGroups(groups.map(x => x._id === g._id ? { ...x, order: Number(e.target.value) } : x))} disabled={!canEdit}
              className="col-span-1 text-xs px-2 py-1 border border-transparent hover:border-stone-200 focus:border-sky-400 rounded outline-none" />
            <button onClick={() => setGroups(groups.filter(x => x._id !== g._id))} disabled={!canEdit}
              className="col-span-1 text-xs text-rose-400 hover:text-rose-700 disabled:opacity-30">×</button>
          </div>
        ))}
      </div>
      <button onClick={() => setGroups([...groups, { _id: nextId(), key: `group_${groups.length + 1}`, label: "New group", order: groups.length }])} disabled={!canEdit}
        className="mt-3 text-sm bg-stone-900 text-white px-3 py-1.5 rounded-md hover:bg-stone-700 disabled:opacity-50">
        + Add group
      </button>
    </div>
  );
}

// ── Danger zone ─────────────────────────────────────────────────────────────

function DangerZone({ templateId, canEdit }: { templateId: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="max-w-xl">
      <h2 className="text-sm font-medium text-stone-900 mb-2">Delete template</h2>
      <p className="text-sm text-stone-500 mb-3">Removes the template and all of its instances. Cannot be undone.</p>
      <button
        onClick={() => {
          if (!confirm("Really delete this template? All instances will be lost.")) return;
          start(async () => {
            await deleteTemplate(templateId);
            router.push("/models/templates");
          });
        }}
        disabled={!canEdit || pending}
        className="text-sm bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete template"}
      </button>
    </div>
  );
}
