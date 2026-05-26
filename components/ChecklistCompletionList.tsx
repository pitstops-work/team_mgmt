"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, CheckCircle2, Circle, Mic, Square, Upload, Loader2, Calendar, Plus, CheckSquare,
} from "lucide-react";
import { confirmManualChecklistTick } from "@/lib/checklistGate";

type Activity = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  type?: string;
  completedAt?: string | null;
};

type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
  status: string;
  completionType?: string | null;
  completedAt?: string | null;
  activities?: Activity[];
};

interface Props {
  pitstopId: string;
  /** Gates the manual tick box (direct checklist edit). */
  canUpdateChecklist?: boolean;
  /** Gates completing the linked activity: mark done / voice log / upload proof. */
  canCompleteActivity?: boolean;
  /** Render the done/total progress bar above the list. */
  showProgress?: boolean;
  /** Called after any change so parents can refresh derived data (flow nodes, chips). */
  onChanged?: () => void;
}

/**
 * Renders a pitstop's checklist with inline completion controls — activities,
 * voice logs and file uploads — under each item, keyed off its completionType.
 * Fetches its own data so it stays live regardless of the parent's snapshot.
 * Shared by the pitstops-list quick sheet and the goal Route Map drill-down panel.
 */
export default function ChecklistCompletionList({
  pitstopId,
  canUpdateChecklist = true,
  canCompleteActivity = true,
  showProgress = false,
  onChanged,
}: Props) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pitstops/${pitstopId}/checklist`)
      .then((r) => r.json())
      .then((data: ChecklistItem[]) => setItems(data))
      .finally(() => setLoading(false));
  }, [pitstopId]);

  const patchItem = (id: string, patch: Partial<ChecklistItem>) => {
    setItems((prev) => prev?.map((i) => (i.id === id ? { ...i, ...patch } : i)) ?? null);
    onChanged?.();
  };

  const patchActivity = (itemId: string, actId: string, patch: Partial<Activity>) => {
    setItems((prev) =>
      prev?.map((i) =>
        i.id === itemId
          ? { ...i, activities: i.activities?.map((a) => (a.id === actId ? { ...a, ...patch } : a)) }
          : i,
      ) ?? null,
    );
    onChanged?.();
  };

  const addActivity = (itemId: string, act: Activity) => {
    setItems((prev) =>
      prev?.map((i) => (i.id === itemId ? { ...i, activities: [...(i.activities ?? []), act] } : i)) ?? null,
    );
    onChanged?.();
  };

  const done = items?.filter((i) => i.checked || i.status === "Done").length ?? 0;
  const total = items?.length ?? 0;

  return (
    <div className="space-y-2">
      {showProgress && total > 0 && (
        <div className="mb-1">
          <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
            <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />{done}/{total}</span>
            <span>{Math.round((done / total) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
        </div>
      )}

      {loading && <p className="text-xs text-stone-400 text-center py-6">Loading…</p>}
      {!loading && items && items.length === 0 && (
        <p className="text-xs text-stone-400 text-center py-6">No checklist items on this pitstop.</p>
      )}
      {!loading &&
        items?.map((item) => (
          <QuickItem
            key={item.id}
            item={item}
            pitstopId={pitstopId}
            canUpdateChecklist={canUpdateChecklist}
            canCompleteActivity={canCompleteActivity}
            onItemPatch={(patch) => patchItem(item.id, patch)}
            onActivityPatch={(actId, patch) => patchActivity(item.id, actId, patch)}
            onActivityAdded={(act) => addActivity(item.id, act)}
          />
        ))}
    </div>
  );
}

function QuickItem({
  item,
  pitstopId,
  canUpdateChecklist,
  canCompleteActivity,
  onItemPatch,
  onActivityPatch,
  onActivityAdded,
}: {
  item: ChecklistItem;
  pitstopId: string;
  canUpdateChecklist: boolean;
  canCompleteActivity: boolean;
  onItemPatch: (patch: Partial<ChecklistItem>) => void;
  onActivityPatch: (actId: string, patch: Partial<Activity>) => void;
  onActivityAdded: (act: Activity) => void;
}) {
  const ct = item.completionType ?? "Activity";
  const isDone = item.checked || item.status === "Done";

  const toggleChecked = async () => {
    if (!canUpdateChecklist) return;
    const next = !isDone;
    if (!confirmManualChecklistTick(item.completionType ?? undefined, next)) return;
    onItemPatch({ checked: next, status: next ? "Done" : "NotStarted" });
    await fetch(`/api/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: next }),
    });
  };

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isDone ? "border-stone-100 bg-stone-50/60" : "border-stone-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-2 p-2.5">
        <button
          onClick={toggleChecked}
          disabled={!canUpdateChecklist}
          className={`mt-0.5 flex-shrink-0 transition-colors ${
            canUpdateChecklist ? "text-stone-400 hover:text-emerald-600" : "text-stone-300 cursor-not-allowed"
          }`}
          title={!canUpdateChecklist ? "You can't edit this checklist" : isDone ? "Mark not done" : "Mark done"}
        >
          {isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4" />}
        </button>
        <p className={`text-xs leading-relaxed flex-1 ${isDone ? "line-through text-stone-400" : "text-stone-700"}`}>
          {item.text}
        </p>
        <span className="text-[9px] uppercase tracking-wide text-stone-400 flex-shrink-0 mt-0.5">{ct}</span>
      </div>

      {ct === "Activity" && (
        <ActivityControls
          item={item}
          pitstopId={pitstopId}
          canCompleteActivity={canCompleteActivity}
          onActivityPatch={onActivityPatch}
          onActivityAdded={onActivityAdded}
        />
      )}
      {ct === "Voice" && canCompleteActivity && <VoiceControl item={item} onItemPatch={onItemPatch} disabled={isDone} />}
      {ct === "Upload" && canCompleteActivity && <UploadControl item={item} onItemPatch={onItemPatch} disabled={isDone} />}
    </div>
  );
}

function ActivityControls({
  item,
  pitstopId,
  canCompleteActivity,
  onActivityPatch,
  onActivityAdded,
}: {
  item: ChecklistItem;
  pitstopId: string;
  canCompleteActivity: boolean;
  onActivityPatch: (actId: string, patch: Partial<Activity>) => void;
  onActivityAdded: (act: Activity) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const markDone = async (actId: string) => {
    onActivityPatch(actId, { status: "Done", completedAt: new Date().toISOString() });
    await fetch(`/api/pitstop-events/${actId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Done" }),
    });
  };

  const handleAdd = async () => {
    if (!date) return;
    setSaving(true);
    const res = await fetch("/api/pitstop-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || item.text,
        scheduledAt: new Date(date).toISOString(),
        pitstopIds: [pitstopId],
        checklistItemId: item.id,
      }),
    });
    if (res.ok) {
      const evt = await res.json();
      onActivityAdded({ id: evt.id, title: evt.title, scheduledAt: evt.scheduledAt, status: "Scheduled" });
      setTitle("");
      setAdding(false);
    }
    setSaving(false);
  };

  return (
    <div className="px-2.5 pb-2.5 space-y-1.5">
      {(item.activities ?? []).map((a) => {
        const done = a.status === "Done";
        return (
          <div key={a.id} className="flex items-center gap-1.5">
            <button
              onClick={() => canCompleteActivity && !done && markDone(a.id)}
              disabled={done || !canCompleteActivity}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border max-w-full truncate transition-colors ${
                done
                  ? "text-stone-400 bg-stone-50 border-stone-200 line-through cursor-default"
                  : canCompleteActivity
                    ? "text-sky-700 bg-sky-50 border-sky-200 hover:bg-sky-100"
                    : "text-stone-500 bg-stone-50 border-stone-200 cursor-default"
              }`}
              title={done ? "Done" : canCompleteActivity ? "Tap to mark done" : "Scheduled"}
            >
              {done ? (
                <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0" />
              ) : (
                <Calendar className="w-2.5 h-2.5 flex-shrink-0" />
              )}
              <span className="truncate">{a.title}</span>
              <span className={`flex-shrink-0 ${done ? "text-stone-400" : "text-sky-500"}`}>·</span>
              <span className={`flex-shrink-0 ${done ? "text-stone-400" : "text-sky-500"}`}>
                {new Date(a.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </button>
          </div>
        );
      })}

      {adding ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Activity title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 px-2 py-1 text-[10px] border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-1.5 py-1 text-[10px] border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-2 py-1 text-[10px] bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? "…" : "Add"}
          </button>
          <button onClick={() => setAdding(false)} className="text-stone-400 hover:text-stone-600">
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-[10px] text-stone-500 hover:text-sky-600 flex items-center gap-0.5"
        >
          <Plus className="w-2.5 h-2.5" /> Add activity
        </button>
      )}
    </div>
  );
}

function VoiceControl({
  item,
  onItemPatch,
  disabled,
}: {
  item: ChecklistItem;
  onItemPatch: (patch: Partial<ChecklistItem>) => void;
  disabled: boolean;
}) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("processing");
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const fd = new FormData();
          fd.append("audio", blob, `recording.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
          const res = await fetch(`/api/checklist/${item.id}/voice`, { method: "POST", body: fd });
          if (res.ok) {
            onItemPatch({ checked: true, status: "Done", completedAt: new Date().toISOString() });
          }
        } finally {
          setState("idle");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
    } catch {
      setState("idle");
    }
  }, [item.id, onItemPatch]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  if (disabled) return null;
  return (
    <div className="px-2.5 pb-2.5">
      {state === "recording" ? (
        <button
          onClick={stop}
          className="flex items-center gap-1 text-[10px] px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded hover:bg-red-100"
        >
          <Square className="w-2.5 h-2.5" /> Stop recording
        </button>
      ) : state === "processing" ? (
        <span className="flex items-center gap-1 text-[10px] text-stone-500">
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Transcribing…
        </span>
      ) : (
        <button
          onClick={start}
          className="flex items-center gap-1 text-[10px] px-2 py-1 bg-stone-50 border border-stone-200 text-stone-700 rounded hover:bg-stone-100"
        >
          <Mic className="w-2.5 h-2.5" /> Record voice log
        </button>
      )}
    </div>
  );
}

function UploadControl({
  item,
  onItemPatch,
  disabled,
}: {
  item: ChecklistItem;
  onItemPatch: (patch: Partial<ChecklistItem>) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("checklistItemId", item.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      onItemPatch({ checked: true, status: "Done", completedAt: new Date().toISOString() });
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (disabled) return null;
  return (
    <div className="px-2.5 pb-2.5">
      <input ref={inputRef} type="file" onChange={handleFile} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1 text-[10px] px-2 py-1 bg-stone-50 border border-stone-200 text-stone-700 rounded hover:bg-stone-100 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
        {uploading ? "Uploading…" : "Upload file"}
      </button>
    </div>
  );
}
