"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export type ActivityModalUser = { id: string; name: string | null; image: string | null };
export type ActivityModalPitstopRef = {
  id: string;
  title: string;
  owner: { id: string; name: string | null; image: string | null };
  goal: {
    id: string;
    title: string;
    needsCluster?: { id: string; name: string } | null;
  };
};
export type ActivityModalEvent = {
  id: string;
  title: string;
  description: string | null;
  type: "Meeting" | "Visit" | "Event";
  status: string;
  scheduledAt: string;
  endsAt: string | null;
  location: string | null;
  pitstops: { pitstop: ActivityModalPitstopRef }[];
  attendees: { id: string; userId: string; status: string; user: ActivityModalUser }[];
  checklistItem?: { id: string; text: string } | null;
};

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ymdFromIso(iso: string) { return toYMD(new Date(iso)); }
function hhmmFromIso(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function AvatarSmall({ user, size = 5 }: { user: ActivityModalUser; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold bg-stone-200 text-stone-600 overflow-hidden`;
  if (user.image) return <img src={user.image} className={cls} alt={user.name ?? ""} />;
  return <span className={cls}>{(user.name ?? "?")[0].toUpperCase()}</span>;
}

export default function AddActivityModal({
  pitstops, users, initial, defaultDate, onClose, onSaved,
}: {
  pitstops: ActivityModalPitstopRef[];
  users: ActivityModalUser[];
  initial?: ActivityModalEvent;
  defaultDate?: string;
  onClose: () => void;
  onSaved: (e: ActivityModalEvent) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<"Meeting" | "Visit" | "Event">(initial?.type ?? "Meeting");
  const [date, setDate] = useState(initial ? ymdFromIso(initial.scheduledAt) : (defaultDate ?? ""));
  const [time, setTime] = useState(initial ? hhmmFromIso(initial.scheduledAt) : "09:00");
  const [isMultiDay, setIsMultiDay] = useState(!!(initial?.endsAt));
  const [endDate, setEndDate] = useState(initial?.endsAt ? ymdFromIso(initial.endsAt) : "");
  const [location, setLocation] = useState(initial?.location ?? "");

  const initialPitstopId = initial?.pitstops?.[0]?.pitstop.id ?? "";
  const initialGoalId = initial?.pitstops?.[0]?.pitstop.goal.id ?? "";
  const [selectedGoalId, setSelectedGoalId] = useState(initialGoalId);
  const [selectedPitstopId, setSelectedPitstopId] = useState(initialPitstopId);
  const [selectedChecklistItemId, setSelectedChecklistItemId] = useState(initial?.checklistItem?.id ?? "");
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; checked: boolean }[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const goals = Array.from(new Map(pitstops.map(p => [p.goal.id, p.goal])).values())
    .sort((a, b) => a.title.localeCompare(b.title));
  const pitstopsForGoal = pitstops.filter(p => p.goal.id === selectedGoalId);

  useEffect(() => {
    if (!selectedPitstopId) { setChecklistItems([]); setSelectedChecklistItemId(""); return; }
    setLoadingItems(true);
    fetch(`/api/pitstops/${selectedPitstopId}/checklist`)
      .then(r => r.json())
      .then((items: { id: string; text: string; checked: boolean }[]) => {
        setChecklistItems(items);
        if (!selectedChecklistItemId) {
          const first = items.find(i => !i.checked);
          if (first) {
            setSelectedChecklistItemId(first.id);
            if (!title) setTitle(first.text);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingItems(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPitstopId]);

  const ownerIds = new Set(
    pitstops.filter(p => p.id === selectedPitstopId).map(p => p.owner.id)
  );
  const initialExtraIds = initial
    ? initial.attendees.filter(a => !ownerIds.has(a.userId)).map(a => a.userId)
    : [];
  const [extraAttendeeIds, setExtraAttendeeIds] = useState<Set<string>>(new Set(initialExtraIds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const extraCandidates = users.filter(u => !ownerIds.has(u.id));

  const toggleExtra = (uid: string) => {
    setExtraAttendeeIds(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) { setError("Title and date are required."); return; }
    if (!selectedPitstopId) { setError("Select a pitstop."); return; }
    if (!selectedChecklistItemId) { setError("Select a checklist item to link this activity to."); return; }
    setLoading(true); setError("");
    const scheduledAt = `${date}T${time}:00`;
    const endsAt = isMultiDay && endDate && endDate > date ? `${endDate}T23:59:00` : null;
    const attendeeIds = Array.from(extraAttendeeIds);
    const body = {
      title: title.trim(), description: description.trim() || null, type, scheduledAt, endsAt,
      location: location.trim() || null,
      pitstopIds: [selectedPitstopId],
      checklistItemId: selectedChecklistItemId,
      attendeeIds,
    };
    const url = initial ? `/api/pitstop-events/${initial.id}` : "/api/pitstop-events";
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setError((await res.json()).error ?? "Something went wrong."); setLoading(false); return; }
    onSaved(await res.json());
  };

  return (
    <SurfaceProvider id="activities.add_modal">
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-900">{initial ? "Edit Event" : "New Event"}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-stone-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Goal <span className="text-red-400">*</span></label>
            <select value={selectedGoalId} onChange={e => { setSelectedGoalId(e.target.value); setSelectedPitstopId(""); setSelectedChecklistItemId(""); setChecklistItems([]); }}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
              <option value="">— select goal —</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
          {selectedGoalId && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Pitstop <span className="text-red-400">*</span></label>
              <select value={selectedPitstopId} onChange={e => { setSelectedPitstopId(e.target.value); setSelectedChecklistItemId(""); }}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                <option value="">— select pitstop —</option>
                {pitstopsForGoal.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}
          {selectedPitstopId && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Checklist Item <span className="text-red-400">*</span>
                {loadingItems && <span className="text-stone-400 font-normal ml-1">loading…</span>}
              </label>
              <select value={selectedChecklistItemId} onChange={e => { setSelectedChecklistItemId(e.target.value); const item = checklistItems.find(i => i.id === e.target.value); if (item) setTitle(item.text); }}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                <option value="">— select checklist item —</option>
                {checklistItems.map(i => <option key={i.id} value={i.id} disabled={i.checked}>{i.checked ? "✓ " : ""}{i.text}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Activity Title</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Auto-filled from checklist item"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as "Meeting"|"Visit"|"Event")}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                <option>Meeting</option><option>Visit</option><option>Event</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Start Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-stone-600 mb-1">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setIsMultiDay(v => !v); setEndDate(""); }}
              className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${isMultiDay ? "bg-sky-500" : "bg-stone-200"}`}>
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${isMultiDay ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
            <span className="text-xs text-stone-600">Multi-day</span>
            {isMultiDay && (
              <div className="flex-1 ml-2">
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  min={date} placeholder="End date"
                  className="w-full px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Location (optional)</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Village name, address…"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          {selectedPitstopId && extraCandidates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Additional Attendees (optional)</label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {extraCandidates.map(u => {
                  const checked = extraAttendeeIds.has(u.id);
                  return (
                    <button key={u.id} type="button" onClick={() => toggleExtra(u.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-colors ${checked ? "bg-sky-50 border-sky-400 text-sky-700" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                      <AvatarSmall user={u} size={4} />
                      {u.name ?? u.id}
                      {checked && <X className="w-2.5 h-2.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Agenda, prep notes…"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
            <button type="submit" disabled={!title.trim() || !date || !selectedPitstopId || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? "Saving…" : initial ? "Save changes" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </SurfaceProvider>
  );
}
