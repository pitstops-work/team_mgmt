"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { X, MapPin, SquarePen, Check } from "lucide-react";
import { LAYERS } from "@/lib/layers";

interface SettlementRef { id: string; name: string; clusterId: string }
interface ClusterOption { id: string; name: string; zoneId: string }
interface ZoneOption    { id: string; name: string }
interface PartnerOption { id: string; key: string; label: string; color: string }

// Built-in NGO partners from LAYERS config
const BUILT_IN_PARTNERS: PartnerOption[] = LAYERS
  .filter(l => l.type === "polygon" && l.key !== "custom_settlements")
  .map(l => ({ id: l.key, key: l.key, label: l.label, color: l.color }));

const LAYER_KEYS = [
  { key: "creches",          label: "Creche" },
  { key: "children_centres", label: "Children Centre" },
  { key: "youth_centres",    label: "Youth Centre" },
  { key: "resource_centres", label: "Resource Centre" },
];

const CENTRE_TYPES: Record<string, string[]> = {
  creches:          ["Creche"],
  children_centres: ["Children Centre"],
  youth_centres:    ["Youth Centre"],
  resource_centres: ["Resource Centre", "Community Resource Centre"],
};

interface Props {
  mapRef: React.MutableRefObject<L.Map | null>;
  onRefresh: () => void;
}

export default function MapAdminPanel({ mapRef, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pin" | "polygon" | null>(null);

  // Reference data
  const [clusters, setClusters] = useState<ClusterOption[]>([]);
  const [zones, setZones]       = useState<ZoneOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [settlements, setSettlements] = useState<SettlementRef[]>([]);

  // Pin state
  const [pinForm, setPinForm] = useState({ name: "", layerKey: "creches", centreType: "Creche", partner: "", settlementId: "", clusterId: "", zoneId: "", notes: "" });
  const [pendingPin, setPendingPin] = useState<L.LatLng | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  // Polygon draw state
  const [drawVertices, setDrawVertices] = useState<L.LatLng[]>([]);
  const [pendingPolygon, setPendingPolygon] = useState<L.LatLng[] | null>(null);
  const [polyZoneId, setPolyZoneId] = useState("");
  const [polyForm, setPolyForm] = useState({ name: "", clusterId: "", partnerId: "" });
  const [polySaving, setPolySaving] = useState(false);

  const drawGroupRef = useRef<L.LayerGroup | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Merged partner list: built-ins first, then any extra DB partners
  const allPartners = [
    ...BUILT_IN_PARTNERS,
    ...partners.filter(d => !BUILT_IN_PARTNERS.some(b => b.key === d.key)),
  ];

  // Load reference data once when panel opens
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/geo").then(r => r.json()),
      fetch("/api/map/partners").then(r => r.json()),
      fetch("/api/admin/settlements").then(r => r.json()),
    ]).then(([geo, parts, setts]) => {
      setClusters(geo.clusters ?? []);
      setZones(geo.zones ?? []);
      setPartners(parts ?? []);
      setSettlements(
        (setts ?? []).map((s: { id: string; name: string; clusterId: string }) => ({
          id: s.id, name: s.name, clusterId: s.clusterId,
        }))
      );
    });
  }, [open]);

  // Draw preview layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!drawGroupRef.current) {
      drawGroupRef.current = L.layerGroup().addTo(map);
    }
    const group = drawGroupRef.current;
    group.clearLayers();

    if (pendingPin) {
      L.circleMarker(pendingPin, {
        radius: 9, fillColor: "#6366f1", color: "white", weight: 2.5, fillOpacity: 1,
      }).addTo(group);
    }

    if (drawVertices.length > 0) {
      drawVertices.forEach(v =>
        L.circleMarker(v, { radius: 5, fillColor: "#f59e0b", color: "white", weight: 2, fillOpacity: 1 }).addTo(group)
      );
      if (drawVertices.length >= 3) {
        L.polygon(drawVertices, { color: "#f59e0b", weight: 2, dashArray: "6 4", fillColor: "#f59e0b", fillOpacity: 0.12 }).addTo(group);
      } else if (drawVertices.length >= 2) {
        L.polyline(drawVertices, { color: "#f59e0b", weight: 2, dashArray: "6 4" }).addTo(group);
      }
    }
  }, [pendingPin, drawVertices, mapRef]);

  // Map click / dblclick handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mode) return;

    const container = map.getContainer();
    container.style.cursor = "crosshair";

    const clickHandler = (e: L.LeafletMouseEvent) => {
      if (mode === "pin") {
        setPendingPin(e.latlng);
      } else if (mode === "polygon") {
        setDrawVertices(prev => [...prev, e.latlng]);
      }
    };

    const dblClickHandler = (e: L.LeafletMouseEvent) => {
      // Leaflet fires click×2 then dblclick; trim the last vertex (from the 2nd click)
      L.DomEvent.stop(e);
      setDrawVertices(prev => {
        const pts = prev.length > 0 ? prev.slice(0, -1) : prev;
        if (pts.length >= 3) {
          setPendingPolygon(pts);
          return [];
        }
        return pts;
      });
    };

    map.on("click", clickHandler);
    map.on("dblclick", dblClickHandler);
    map.doubleClickZoom.disable();

    return () => {
      map.off("click", clickHandler);
      map.off("dblclick", dblClickHandler);
      map.doubleClickZoom.enable();
      container.style.cursor = "";
    };
  }, [mode, mapRef]);

  // Clean up when panel closes
  useEffect(() => {
    if (!open) {
      drawGroupRef.current?.clearLayers();
      setPendingPin(null);
      setDrawVertices([]);
      setPendingPolygon(null);
      setMode(null);
    }
  }, [open]);

  function cancelMode() {
    setMode(null);
    setPendingPin(null);
    setDrawVertices([]);
    setPendingPolygon(null);
    drawGroupRef.current?.clearLayers();
  }

  async function savePin() {
    if (!pendingPin || !pinForm.name.trim()) return;
    setPinSaving(true);
    const r = await fetch("/api/admin/layer-features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: pinForm.name,
        layerKey: pinForm.layerKey,
        centreType: pinForm.centreType || null,
        partner: pinForm.partner || null,
        lat: pendingPin.lat,
        lng: pendingPin.lng,
        settlementId: pinForm.settlementId || null,
        clusterId: pinForm.clusterId || null,
        zoneId: pinForm.zoneId || null,
        notes: pinForm.notes || null,
      }),
    });
    setPinSaving(false);
    if (r.ok) {
      showToast("Point saved");
      setPendingPin(null);
      setPinForm({ name: "", layerKey: "creches", centreType: "Creche", partner: "", settlementId: "", clusterId: "", zoneId: "", notes: "" });
      drawGroupRef.current?.clearLayers();
      onRefresh();
    } else {
      showToast("Failed to save");
    }
  }

  async function savePolygon() {
    if (!pendingPolygon || !polyForm.name.trim() || !polyForm.clusterId) return;
    setPolySaving(true);
    const coords = [...pendingPolygon, pendingPolygon[0]].map(v => [v.lng, v.lat]);
    const geometry = { type: "Polygon", coordinates: [coords] };
    const centroidLat = pendingPolygon.reduce((s, v) => s + v.lat, 0) / pendingPolygon.length;
    const centroidLng = pendingPolygon.reduce((s, v) => s + v.lng, 0) / pendingPolygon.length;
    const r = await fetch("/api/admin/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: polyForm.name,
        clusterId: polyForm.clusterId,
        partnerId: polyForm.partnerId || null,
        polygon: geometry,
        centroidLat,
        centroidLng,
      }),
    });
    setPolySaving(false);
    if (r.ok) {
      showToast("Settlement saved");
      setPendingPolygon(null);
      setDrawVertices([]);
      setPolyZoneId("");
      setPolyForm({ name: "", clusterId: "", partnerId: "" });
      drawGroupRef.current?.clearLayers();
      onRefresh();
    } else {
      showToast("Failed to save");
    }
  }

  // Derived: cluster→zone cascade for pin form
  const pinCluster = clusters.find(c => c.id === pinForm.clusterId);
  const pinZoneId = pinForm.zoneId || pinCluster?.zoneId || "";

  // Filtered clusters for pin form (by selected zone)
  const pinClusters = pinForm.zoneId
    ? clusters.filter(c => c.zoneId === pinForm.zoneId)
    : clusters;

  // Filtered clusters for polygon form (by selected zone)
  const polyClusters = polyZoneId
    ? clusters.filter(c => c.zoneId === polyZoneId)
    : clusters;

  // ── Closed state — just the "Edit Map" button ─────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-28 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 bg-white border border-indigo-200 shadow-lg px-4 py-2 rounded-full text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Edit Map
      </button>
    );
  }

  return (
    <>
      {/* Edit mode toolbar */}
      <div className="absolute bottom-28 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2 items-center bg-white border border-indigo-300 shadow-xl px-3 py-2 rounded-2xl">
        <span className="text-xs font-bold text-indigo-700 mr-1">Edit Map</span>
        {!mode && !pendingPin && !pendingPolygon && (
          <>
            <button onClick={() => setMode("pin")} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-full text-xs font-semibold hover:bg-indigo-700 transition-colors">
              <MapPin className="w-3.5 h-3.5" /> Place Pin
            </button>
            <button onClick={() => { setMode("polygon"); setDrawVertices([]); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-full text-xs font-semibold hover:bg-amber-600 transition-colors">
              <SquarePen className="w-3.5 h-3.5" /> Draw Settlement
            </button>
          </>
        )}
        {mode === "pin" && !pendingPin && (
          <div className="flex items-center gap-2 text-xs text-indigo-700 font-semibold">
            <span>Click on the map to place pin</span>
            <button onClick={cancelMode} className="text-indigo-400 hover:text-indigo-700"><X className="w-4 h-4" /></button>
          </div>
        )}
        {mode === "polygon" && !pendingPolygon && (
          <div className="flex items-center gap-2 text-xs text-amber-700 font-semibold">
            <span>Click to add points · Double-click to finish ({drawVertices.length} pts, min 3)</span>
            <button onClick={cancelMode} className="text-amber-400 hover:text-amber-700"><X className="w-4 h-4" /></button>
          </div>
        )}
        {(pendingPin || pendingPolygon) && (
          <button onClick={cancelMode} className="text-slate-400 hover:text-slate-700 flex items-center gap-1 text-xs">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        )}
        <button onClick={() => { cancelMode(); setOpen(false); }} className="ml-1 p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors" title="Close edit mode">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Pin form ────────────────────────────────────────────────────────── */}
      {pendingPin && (
        <div className="absolute top-16 left-3 right-3 sm:top-4 sm:right-4 sm:left-auto sm:w-80 z-20 bg-white rounded-xl shadow-2xl border border-indigo-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-indigo-50 flex items-center justify-between">
            <span className="text-sm font-bold text-indigo-800 flex items-center gap-1.5"><MapPin className="w-4 h-4" /> New Centre Point</span>
            <span className="text-xs text-indigo-400 font-mono">{pendingPin.lat.toFixed(5)}, {pendingPin.lng.toFixed(5)}</span>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto max-h-[72vh]">

            <Field label="Name *">
              <input className="inp" value={pinForm.name} onChange={e => setPinForm(f => ({ ...f, name: e.target.value }))} placeholder="Centre name" autoFocus />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Layer type *">
                <select className="inp" value={pinForm.layerKey} onChange={e => {
                  const lk = e.target.value;
                  setPinForm(f => ({ ...f, layerKey: lk, centreType: CENTRE_TYPES[lk]?.[0] ?? "" }));
                }}>
                  {LAYER_KEYS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
              </Field>
              <Field label="Centre type">
                <select className="inp" value={pinForm.centreType} onChange={e => setPinForm(f => ({ ...f, centreType: e.target.value }))}>
                  {(CENTRE_TYPES[pinForm.layerKey] ?? []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Partner">
              <select className="inp" value={pinForm.partner} onChange={e => setPinForm(f => ({ ...f, partner: e.target.value }))}>
                <option value="">— None —</option>
                {allPartners.map(p => <option key={p.id} value={p.key}>{p.label}</option>)}
              </select>
            </Field>

            <Field label="Settlement">
              <select className="inp" value={pinForm.settlementId} onChange={e => {
                const sid = e.target.value;
                const s = settlements.find(s => s.id === sid);
                const cl = s ? clusters.find(c => c.id === s.clusterId) : undefined;
                setPinForm(f => ({ ...f, settlementId: sid, clusterId: s?.clusterId ?? f.clusterId, zoneId: cl?.zoneId ?? f.zoneId }));
              }}>
                <option value="">— None —</option>
                {settlements.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Zone">
                <select className="inp" value={pinZoneId} onChange={e => {
                  const zid = e.target.value;
                  setPinForm(f => ({ ...f, zoneId: zid, clusterId: "" }));
                }}>
                  <option value="">— All zones —</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </Field>
              <Field label="Cluster">
                <select className="inp" value={pinForm.clusterId} onChange={e => {
                  const cid = e.target.value;
                  const cl = clusters.find(c => c.id === cid);
                  setPinForm(f => ({ ...f, clusterId: cid, zoneId: cl?.zoneId ?? f.zoneId }));
                }}>
                  <option value="">— None —</option>
                  {pinClusters.map(c => <option key={c.id} value={c.id}>{c.name.replace(/_/g, " ")}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Notes">
              <textarea className="inp resize-none" rows={2} value={pinForm.notes} onChange={e => setPinForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>

            <div className="flex gap-2 pt-1">
              <button onClick={savePin} disabled={!pinForm.name.trim() || pinSaving} className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                <Check className="w-3.5 h-3.5" /> {pinSaving ? "Saving…" : "Save Point"}
              </button>
              <button onClick={cancelMode} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Polygon form ─────────────────────────────────────────────────────── */}
      {pendingPolygon && (
        <div className="absolute top-16 left-3 right-3 sm:top-4 sm:right-4 sm:left-auto sm:w-80 z-20 bg-white rounded-xl shadow-2xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-amber-50 flex items-center justify-between">
            <span className="text-sm font-bold text-amber-800 flex items-center gap-1.5"><SquarePen className="w-4 h-4" /> New Settlement</span>
            <span className="text-xs text-amber-500">{pendingPolygon.length} vertices</span>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto max-h-[72vh]">

            <Field label="Settlement name *">
              <input className="inp" value={polyForm.name} onChange={e => setPolyForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mattikere Slum" autoFocus />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Zone">
                <select className="inp" value={polyZoneId} onChange={e => { setPolyZoneId(e.target.value); setPolyForm(f => ({ ...f, clusterId: "" })); }}>
                  <option value="">— All zones —</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </Field>
              <Field label="Cluster *">
                <select className="inp" value={polyForm.clusterId} onChange={e => setPolyForm(f => ({ ...f, clusterId: e.target.value }))}>
                  <option value="">— Select —</option>
                  {polyClusters.map(c => <option key={c.id} value={c.id}>{c.name.replace(/_/g, " ")}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Partner NGO">
              <select className="inp" value={polyForm.partnerId} onChange={e => setPolyForm(f => ({ ...f, partnerId: e.target.value }))}>
                <option value="">— None —</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>

            <div className="flex gap-2 pt-1">
              <button onClick={savePolygon} disabled={!polyForm.name.trim() || !polyForm.clusterId || polySaving} className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 hover:bg-amber-600 transition-colors">
                <Check className="w-3.5 h-3.5" /> {polySaving ? "Saving…" : "Save Settlement"}
              </button>
              <button onClick={cancelMode} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 z-30 px-5 py-2 bg-slate-800 text-white text-sm font-medium rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
