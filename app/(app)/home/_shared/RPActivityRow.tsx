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
import { SectionTitle } from "../_shared/Primitives";
import { fetchJson } from "@/lib/fetchJson";

export function RPOverdueCard({
  a, linkedChecklist, onDone, onCompleted, isLoadingDone, isOverdue = true,
}: {
  a: Activity;
  linkedChecklist: ChecklistItem | null;
  onDone: (eventId: string) => void;
  onCompleted: (checklistItemId: string) => void;
  isLoadingDone: boolean;
  isOverdue?: boolean;
}) {
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing">("idle");
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const completionType = linkedChecklist?.completionType ?? "Activity";
  const isBusy = voiceState !== "idle" || uploading || isLoadingDone;
  const ciGoal = linkedChecklist?.pitstop.goal;
  const actGoal = a.pitstops?.[0]?.pitstop.goal;
  const rawDomain = ciGoal?.needsDomain ?? actGoal?.needsDomain ?? null;
  const domainLabel = rawDomain ? fmtDomain(rawDomain) : null;
  const clusterName = ciGoal?.needsCluster?.name ?? actGoal?.needsCluster?.name ?? null;

  async function startVoiceLog() {
    if (!linkedChecklist) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setVoiceState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");
        try {
          await fetchJson(`/api/checklist/${linkedChecklist.id}/voice`, { method: "POST", body: fd });
          onCompleted(linkedChecklist.id);
        } catch {
          // surface gate or transcription error
        }
        setVoiceState("idle");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setVoiceState("recording");
    } catch { setVoiceState("idle"); }
  }

  function stopVoiceLog() { mediaRecorderRef.current?.stop(); }

  async function handleAttach(file: File) {
    if (!linkedChecklist) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("checklistItemId", linkedChecklist.id);
    try {
      await fetchJson("/api/upload", { method: "POST", body: fd });
      onCompleted(linkedChecklist.id);
    } catch {
      // surface gate or upload error
    }
    setUploading(false);
  }

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3 shadow-sm min-h-[160px] border ${
      isOverdue ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"
    }`}>
      {/* Domain + cluster badges */}
      {(domainLabel || clusterName) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {domainLabel && (
            <span className={`text-[11px] font-semibold bg-white px-2 py-0.5 rounded-full border ${
              isOverdue ? "text-amber-700 border-amber-200" : "text-violet-700 border-violet-200"
            }`}>
              {domainLabel}
            </span>
          )}
          {clusterName && (
            <span className="text-[11px] text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded-full">
              {clusterName}
            </span>
          )}
        </div>
      )}

      {/* Title + meta */}
      <div className="flex-1">
        <p className="text-base font-semibold text-stone-800 leading-snug mb-1">{a.title}</p>
        {actGoal?.title && (
          <p className="text-[11px] text-stone-400 mb-1.5 truncate">{actGoal.title}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {a.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>
              {a.type}
            </span>
          )}
          {isOverdue
            ? <span className="text-xs font-medium text-amber-700">{daysAgo(a.scheduledAt)}d overdue</span>
            : <span className="text-xs text-stone-400">{fmtTime(a.scheduledAt)}</span>
          }
          {a.location && <span className="text-xs text-stone-400 truncate">· {a.location}</span>}
        </div>
      </div>

      {/* Action */}
      {completionType === "Activity" && (
        <button onClick={() => onDone(a.id)} disabled={isBusy}
          className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors">
          {isLoadingDone ? "Updating…" : "Mark Done"}
        </button>
      )}
      {completionType === "Voice" && (
        voiceState === "recording"
          ? <button onClick={stopVoiceLog} className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-sm transition-colors">Stop Recording</button>
          : voiceState === "idle" && !isBusy
            ? <button onClick={startVoiceLog} className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors">
                <Mic className="w-4 h-4" /> Record Voice Log
              </button>
            : null
      )}
      {completionType === "Upload" && !isBusy && (
        <>
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-stone-600 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl transition-colors">
            <Paperclip className="w-4 h-4" /> Attach File
          </button>
          <input type="file" ref={fileInputRef} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAttach(f); e.target.value = ""; }} />
        </>
      )}
      {(voiceState === "processing" || uploading) && (
        <div className="w-full py-2.5 flex items-center justify-center gap-2 text-sm text-stone-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {voiceState === "processing" ? "Transcribing…" : "Uploading…"}
        </div>
      )}
    </div>
  );
}

// ── RP overdue carousel — horizontal scroll-snap for mobile ───────────────────

export function RPOverdueCarousel({
  overdueItems, activityChecklistMap, loadingDoneId, onDone, onCompleted,
}: {
  overdueItems: Activity[];
  activityChecklistMap: Map<string, ChecklistItem>;
  loadingDoneId: string | null;
  onDone: (eventId: string) => void;
  onCompleted: (checklistItemId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCurrentIdx(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <SectionTitle>Needs your update</SectionTitle>
        </div>
        {overdueItems.length > 1 && (
          <span className="text-xs text-stone-400 tabular-nums">{currentIdx + 1} of {overdueItems.length}</span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {overdueItems.map(a => (
          <div key={a.id} className="snap-start flex-shrink-0 w-full pr-[1px]">
            <RPOverdueCard
              a={a}
              linkedChecklist={activityChecklistMap.get(a.id) ?? null}
              onDone={onDone} onCompleted={onCompleted}
              isLoadingDone={loadingDoneId === a.id}
            />
          </div>
        ))}
      </div>

      {overdueItems.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {overdueItems.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-200 ${
              i === currentIdx ? "w-4 bg-amber-500" : "w-1.5 bg-stone-200"
            }`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RPTodayCarousel({
  todayItems, activityChecklistMap, loadingDoneId, onDone, onCompleted,
}: {
  todayItems: Activity[];
  activityChecklistMap: Map<string, ChecklistItem>;
  loadingDoneId: string | null;
  onDone: (id: string) => void;
  onCompleted: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Today</SectionTitle>
        {todayItems.length > 1 && (
          <span className="text-xs text-stone-400 tabular-nums">{currentIdx + 1} of {todayItems.length}</span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={e => setCurrentIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {todayItems.map(a => (
          <div key={a.id} className="snap-start flex-shrink-0 w-full pr-[1px]">
            <RPOverdueCard
              a={a} isOverdue={false}
              linkedChecklist={activityChecklistMap.get(a.id) ?? null}
              onDone={onDone} onCompleted={onCompleted}
              isLoadingDone={loadingDoneId === a.id}
            />
          </div>
        ))}
      </div>
      {todayItems.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {todayItems.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-200 ${
              i === currentIdx ? "w-4 bg-stone-400" : "w-1.5 bg-stone-200"
            }`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RPActivityRow({
  a, userId, isOverdue, linkedChecklist, onDone, onCompleted, isLoadingDone,
}: {
  a: Activity;
  userId: string;
  isOverdue: boolean;
  linkedChecklist: ChecklistItem | null;
  onDone: (eventId: string) => void;
  onCompleted: (checklistItemId: string) => void;
  isLoadingDone: boolean;
}) {
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing">("idle");
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const completionType = linkedChecklist?.completionType ?? "Activity";
  const isBusy = voiceState !== "idle" || uploading || isLoadingDone;

  const { goal, isOwner, isAttendee, geo, domain } = activityMeta(a, userId);

  async function startVoiceLog() {
    if (!linkedChecklist) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setVoiceState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");
        try {
          await fetchJson(`/api/checklist/${linkedChecklist.id}/voice`, { method: "POST", body: fd });
          onCompleted(linkedChecklist.id);
        } catch {
          // surface gate or transcription error
        }
        setVoiceState("idle");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setVoiceState("recording");
    } catch {
      setVoiceState("idle");
    }
  }

  function stopVoiceLog() { mediaRecorderRef.current?.stop(); }

  async function handleAttach(file: File) {
    if (!linkedChecklist) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("checklistItemId", linkedChecklist.id);
    try {
      await fetchJson("/api/upload", { method: "POST", body: fd });
      onCompleted(linkedChecklist.id);
    } catch {
      // surface gate or upload error
    }
    setUploading(false);
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
      isOverdue ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
          {a.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>
              {a.type}
            </span>
          )}
          {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
          {isAttendee && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
        </div>
        <p className={`text-xs ${isOverdue ? "text-amber-700" : "text-stone-400"}`}>
          {isOverdue
            ? `${daysAgo(a.scheduledAt)}d ago${a.location ? ` · ${a.location}` : ""}`
            : `${fmtTime(a.scheduledAt)}${a.location ? ` · ${a.location}` : ""}`
          }
        </p>
        {(goal?.title || domain || geo) && (
          <p className="text-[11px] text-stone-400 truncate mt-0.5">
            {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {completionType === "Activity" && (
        <button onClick={() => onDone(a.id)} disabled={isBusy}
          className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex-shrink-0">
          {isLoadingDone ? "…" : "Done"}
        </button>
      )}
      {completionType === "Voice" && (
        voiceState === "recording"
          ? <button onClick={stopVoiceLog} className="text-xs px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex-shrink-0">Stop</button>
          : voiceState === "idle" && !isBusy
            ? <button onClick={startVoiceLog} className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-stone-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors flex-shrink-0">
                <Mic className="w-3 h-3" /> Log
              </button>
            : null
      )}
      {completionType === "Upload" && !isBusy && (
        <>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-stone-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors flex-shrink-0">
            <Paperclip className="w-3 h-3" /> Attach
          </button>
          <input type="file" ref={fileInputRef} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAttach(f); e.target.value = ""; }} />
        </>
      )}
      {(voiceState === "processing" || uploading) && (
        <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin flex-shrink-0" />
      )}
    </div>
  );
}

// Reusable cluster-card "today" view. Used by every designation's Today tab
// for the user's own work (cluster cards + collapsible sections + mobile
// horizontal carousel + Done/Voice/Upload actions inline). ZL/PM compose
// this on top of their team-breakdown sections; RP and Leader use it alone.
