"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  X, ArrowRight, CheckCircle2, Circle, Mic, Square, Upload, Loader2, Calendar, Plus,
} from "lucide-react";

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
  completionType?: string;
  completedAt?: string | null;
  activities?: Activity[];
};

interface Props {
  pitstop: {
    id: string;
    title: string;
    goal: { id: string; title: string };
  };
  onClose: () => void;
  onChanged: () => void;
}

export default function PitstopQuickSheet({ pitstop, onClose, onChanged }: Props) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/pitstops/${pitstop.id}/checklist`)
      .then((r) => r.json())
      .then((data: ChecklistItem[]) => setItems(data))
      .finally(() => setLoading(false));
  }, [pitstop.id]);

  const patchItem = (id: string, patch: Partial<ChecklistItem>) => {
    setItems((prev) => prev?.map((i) => (i.id === id ? { ...i, ...patch } : i)) ?? null);
    onChanged();
  };

  const patchActivity = (itemId: string, actId: string, patch: Partial<Activity>) => {
    setItems((prev) =>
      prev?.map((i) =>
        i.id === itemId
          ? { ...i, activities: i.activities?.map((a) => (a.id === actId ? { ...a, ...patch } : a)) }
          : i,
      ) ?? null,
    );
    onChanged();
  };

  const addActivity = (itemId: string, act: Activity) => {
    setItems((prev) =>
      prev?.map((i) => (i.id === itemId ? { ...i, activities: [...(i.activities ?? []), act] } : i)) ?? null,
    );
    onChanged();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md sm:mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-stone-900 truncate">{pitstop.title}</h2>
            <p className="text-xs text-stone-500 truncate">{pitstop.goal.title}</p>
          </div>
          <Link
            href={`/goals/${pitstop.goal.id}/pitstops/${pitstop.id}`}
            className="text-xs text-sky-600 hover:underline flex items-center gap-0.5 flex-shrink-0 mt-0.5"
          >
            Open <ArrowRight className="w-3 h-3" />
          </Link>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <p className="text-xs text-stone-400 text-center py-6">Loading…</p>}
          {!loading && items && items.length === 0 && (
            <p className="text-xs text-stone-400 text-center py-6">No checklist items on this pitstop.</p>
          )}
          {!loading &&
            items?.map((item) => (
              <QuickItem
                key={item.id}
                item={item}
                pitstopId={pitstop.id}
                onItemPatch={(patch) => patchItem(item.id, patch)}
                onActivityPatch={(actId, patch) => patchActivity(item.id, actId, patch)}
                onActivityAdded={(act) => addActivity(item.id, act)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function QuickItem({
  item,
  pitstopId,
  onItemPatch,
  onActivityPatch,
  onActivityAdded,
}: {
  item: ChecklistItem;
  pitstopId: string;
  onItemPatch: (patch: Partial<ChecklistItem>) => void;
  onActivityPatch: (actId: string, patch: Partial<Activity>) => void;
  onActivityAdded: (act: Activity) => void;
}) {
  const ct = item.completionType ?? "Activity";
  const isDone = item.checked || item.status === "Done";

  const toggleChecked = async () => {
    const next = !isDone;
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
          className="mt-0.5 flex-shrink-0 text-stone-400 hover:text-emerald-600 transition-colors"
          title={isDone ? "Mark not done" : "Mark done"}
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
          onActivityPatch={onActivityPatch}
          onActivityAdded={onActivityAdded}
        />
      )}
      {ct === "Voice" && <VoiceControl item={item} onItemPatch={onItemPatch} disabled={isDone} />}
      {ct === "Upload" && <UploadControl item={item} onItemPatch={onItemPatch} disabled={isDone} />}
    </div>
  );
}

function ActivityControls({
  item,
  pitstopId,
  onActivityPatch,
  onActivityAdded,
}: {
  item: ChecklistItem;
  pitstopId: string;
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
              onClick={() => !done && markDone(a.id)}
              disabled={done}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border max-w-full truncate transition-colors ${
                done
                  ? "text-stone-400 bg-stone-50 border-stone-200 line-through cursor-default"
                  : "text-sky-700 bg-sky-50 border-sky-200 hover:bg-sky-100"
              }`}
              title={done ? "Done" : "Tap to mark done"}
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
