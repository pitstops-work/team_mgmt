"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight, ChevronLeft, LayoutDashboard, Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, Filter, ChevronDown, ChevronUp, Mic, Square, Loader2, Paperclip } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import Avatar from "@/components/Avatar";
import type { ActivityGoal, Activity, ChecklistItem, Goal, TeamMember, ZLTeamActivity, TabKey } from "../_lib/types";
import { fmtTime, fmtDate, fmtDateShort, isToday, daysDiff, daysAgo, activityMeta, groupByDay, fmtDomain, groupBySla, slaHeaderLabel, engLevel, istTodayStr, shiftIstDate } from "../_lib/helpers";
import { STATUS_BADGE, STATUS_DOT, CHECKLIST_STATUS_DOT, EVENT_TYPE_COLOR, ACTIVITY_TYPE_STYLE, DESIGNATION_ORDER, DESIGNATION_COLOR, PITSTOP_STATUS_COLOR } from "../_lib/constants";
import type { DomainStat, ClusterStat, ClusterStatus, RPHealthStat, ZLHealthStat, RPPitstopDetail, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop, AdminPersonHealth, AdminDelayedPitstop, AdminOverdueActivity, AdminEngagementStat, AdminCityCoverage, LeaderTeamMember, RPClusterDeckCluster, FacilityLayerConfigLite } from "../page";

export function RPChecklistRow({
  item,
  onCompleted,
  compact = false,
}: {
  item: ChecklistItem;
  onCompleted: (id: string) => void;
  compact?: boolean;
}) {
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing">("idle");
  const [uploading, setUploading] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activity = item.activities[0] ?? null;

  async function handleActivityDone() {
    if (!activity) return;
    setMarkingDone(true);
    const res = await fetch(`/api/pitstop-events/${activity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Done" }),
    });
    if (res.ok) onCompleted(item.id);
    setMarkingDone(false);
  }

  async function startVoiceLog() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setVoiceState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");
        const res = await fetch(`/api/checklist/${item.id}/voice`, { method: "POST", body: fd });
        if (res.ok) onCompleted(item.id);
        setVoiceState("idle");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setVoiceState("recording");
    } catch {
      setVoiceState("idle");
    }
  }

  function stopVoiceLog() {
    mediaRecorderRef.current?.stop();
  }

  async function handleAttach(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("checklistItemId", item.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) onCompleted(item.id);
  }

  const isBusy = voiceState !== "idle" || uploading || markingDone;

  return (
    <div className="px-4 py-3 space-y-2">
      {/* Checklist item — read-only */}
      <div className="flex items-start gap-2.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${CHECKLIST_STATUS_DOT[item.status] ?? "bg-stone-200"}`} />
        <div className="min-w-0">
          <Link href={`/goals/${item.pitstop.goal.id}/pitstops/${item.pitstop.id}`}>
            <p className="text-sm text-stone-800 hover:text-sky-700 transition-colors">{item.text}</p>
            {!compact && (
              <p className="text-xs text-stone-400 mt-0.5 truncate">{item.pitstop.goal.title} · {item.pitstop.title}</p>
            )}
          </Link>
        </div>
      </div>

      {/* Linked activity with action */}
      {activity ? (
        <div className="ml-4.5 flex items-center gap-2 px-3 py-2 bg-stone-50 rounded-lg border border-stone-100">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[activity.type] ?? "bg-stone-300"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-stone-600 truncate">{activity.title}</p>
            <p className="text-[10px] text-stone-400">{fmtDate(activity.scheduledAt)} · {fmtTime(activity.scheduledAt)}</p>
          </div>
          {item.completionType === "Activity" && !isBusy && (
            <button
              onClick={handleActivityDone}
              className="text-xs px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md font-medium transition-colors flex-shrink-0"
            >
              Done
            </button>
          )}
          {item.completionType === "Voice" && (
            voiceState === "recording" ? (
              <button onClick={stopVoiceLog} className="text-xs px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md font-medium transition-colors flex-shrink-0">
                Stop
              </button>
            ) : voiceState === "idle" && !uploading && !markingDone ? (
              <button onClick={startVoiceLog} className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-stone-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors flex-shrink-0">
                <Mic className="w-3 h-3" /> Log
              </button>
            ) : null
          )}
          {item.completionType === "Upload" && !isBusy && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-stone-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors flex-shrink-0"
            >
              <Paperclip className="w-3 h-3" /> Attach
            </button>
          )}
          {(markingDone || uploading || voiceState === "processing") && (
            <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin flex-shrink-0" />
          )}
          {voiceState === "processing" && (
            <span className="text-[10px] text-sky-600 flex-shrink-0">Transcribing…</span>
          )}
        </div>
      ) : (
        <p className="ml-4.5 text-[10px] text-stone-300 italic">No activity scheduled</p>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleAttach(f); e.target.value = ""; }}
      />
    </div>
  );
}

// ── shared helpers ────────────────────────────────────────────────────────────

