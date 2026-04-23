"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Plus, Paperclip, Upload, X, Bell, BellOff, Trash2, Calendar,
  CheckSquare, Lock, Unlock, RefreshCw, Pencil, ShieldCheck, History, FileText, UserPlus,
} from "lucide-react";
import { getTimelineInfo, timelineChip, fmtDate, toDateInput } from "@/lib/timeline";
import OwnerPicker from "@/components/OwnerPicker";
import Avatar from "@/components/Avatar";
import { PitstopStatusBadge } from "@/components/StatusBadge";
import PitstopTypeBadge from "@/components/PitstopTypeBadge";
import MessageComposer from "./MessageComposer";
import MessageBubble from "./MessageBubble";
import RetrospectiveSection from "./RetrospectiveSection";
import EscalationSection from "./EscalationSection";
import CoOwnersSection from "./CoOwnersSection";
import ThemesSection from "./ThemesSection";
import GeographySection from "./GeographySection";
import AuditSection from "./AuditSection";

// ── Types ─────────────────────────────────────────────────────────────────────

type Attachment = { id: string; name: string; url: string; type: string; mimeType?: string | null };
type Mention = { user: { id: string; name: string | null } };
type Message = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
  attachments: Attachment[];
  mentions: Mention[];
  msgType?: string;
  audioUrl?: string | null;
  originalLang?: string;
  translations?: Record<string, string> | null;
};
type Thread = { id: string; name: string; messages: Message[] };
type User = { id: string; name: string | null; image: string | null };
type ActivityRef = { id: string; title: string; scheduledAt: string };
type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
  order: number;
  status: string;
  assigneeId: string | null;
  notes: string | null;
  activities: ActivityRef[];
};
type DepPitstop = { id: string; title: string; status: string };
type Dependency = { id: string; blockedBy: DepPitstop };
type PitstopRecurrence = "None" | "Weekly" | "Monthly" | "Quarterly";
type DateChange = {
  id: string;
  field: string;
  oldDate: string;
  newDate: string;
  reason: string | null;
  createdAt: string;
  changedBy: { id: string; name: string | null; image: string | null };
};
const PROGRESS_TAGS = ["Team", "Baseline", "Permissions", "Infrastructure", "Training", "Live", "Monitoring"] as const;
type ProgressTag = typeof PROGRESS_TAGS[number];
const TAG_COLORS: Record<ProgressTag, string> = {
  Team:           "bg-stone-50 text-stone-700 border-stone-200",
  Baseline:       "bg-sky-50 text-sky-700 border-sky-200",
  Permissions:    "bg-amber-50 text-amber-700 border-amber-200",
  Infrastructure: "bg-violet-50 text-violet-700 border-violet-200",
  Training:       "bg-teal-50 text-teal-700 border-teal-200",
  Live:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  Monitoring:     "bg-rose-50 text-rose-700 border-rose-200",
};

type Pitstop = {
  id: string;
  title: string;
  type: string;
  customType?: string | null;
  notes: string | null;
  status: "Upcoming" | "InProgress" | "Done";
  recurrence: PitstopRecurrence;
  progressTag?: string | null;
  ownerId?: string | null;
  owner?: User | null;
  startDate?: string | null;
  targetDate?: string | null;
  completedAt?: string | null;
  verifiedById?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: User | null;
  dateChanges: DateChange[];
  goal: { id: string; title: string; targetDate?: string | null };
  attachments: Attachment[];
  checklistItems: ChecklistItem[];
  blockedBy: Dependency[];
  threads: Thread[];
  needsZoneId?: string | null;
  needsClusterId?: string | null;
  needsSettlementId?: string | null;
};
type SiblingPitstop = { id: string; title: string; status: string };

interface Props {
  pitstop: Pitstop;
  users: User[];
  siblingPitstops: SiblingPitstop[];
  currentUserId: string;
  currentUserName: string;
  subscribedThreadIds: string[];
  preferredLang: string;
}

// ── Status config ─────────────────────────────────────────────────────────────

const CHECKLIST_STATUSES = [
  "NotStarted", "Scheduled", "InProgress", "Done", "Blocked", "Rescheduled", "Cancelled",
] as const;
type ChecklistStatus = typeof CHECKLIST_STATUSES[number];

const STATUS_CFG: Record<ChecklistStatus, { label: string; cls: string }> = {
  NotStarted:  { label: "Not started",  cls: "text-stone-500 border-stone-200 bg-stone-50" },
  Scheduled:   { label: "Scheduled",    cls: "text-sky-600 border-sky-200 bg-sky-50" },
  InProgress:  { label: "In progress",  cls: "text-amber-600 border-amber-200 bg-amber-50" },
  Done:        { label: "Done",         cls: "text-emerald-600 border-emerald-200 bg-emerald-50" },
  Blocked:     { label: "Blocked",      cls: "text-red-600 border-red-200 bg-red-50" },
  Rescheduled: { label: "Rescheduled",  cls: "text-violet-600 border-violet-200 bg-violet-50" },
  Cancelled:   { label: "Cancelled",    cls: "text-stone-400 border-stone-200 bg-stone-50" },
};

// ── ChecklistItemRow ──────────────────────────────────────────────────────────

function ChecklistItemRow({
  item, users, pitstopId,
  onToggle, onUpdateStatus, onUpdateAssignee, onUpdateNotes, onDelete, onActivityCreated,
}: {
  item: ChecklistItem;
  users: User[];
  pitstopId: string;
  onToggle: (id: string, checked: boolean) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdateAssignee: (id: string, assigneeId: string | null) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onDelete: (id: string) => void;
  onActivityCreated: (itemId: string, activity: ActivityRef) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [actDate, setActDate] = useState("");
  const [actTitle, setActTitle] = useState(item.text);
  const [savingActivity, setSavingActivity] = useState(false);

  const assignee = users.find((u) => u.id === item.assigneeId) ?? null;
  const cfg = STATUS_CFG[item.status as ChecklistStatus] ?? STATUS_CFG.NotStarted;
  const isFaded = item.status === "Done" || item.status === "Cancelled" || item.checked;

  const handleSchedule = async () => {
    if (!actDate) return;
    setSavingActivity(true);
    const res = await fetch("/api/pitstop-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: actTitle || item.text,
        scheduledAt: new Date(actDate).toISOString(),
        pitstopIds: [pitstopId],
        checklistItemId: item.id,
      }),
    });
    if (res.ok) {
      const event = await res.json();
      onActivityCreated(item.id, { id: event.id, title: event.title, scheduledAt: event.scheduledAt });
      onUpdateStatus(item.id, "Scheduled");
      setScheduling(false);
    }
    setSavingActivity(false);
  };

  return (
    <div className={`rounded-lg border group transition-colors ${isFaded ? "border-stone-100 bg-stone-50/50" : "border-stone-200 bg-white"}`}>
      <div className="flex items-start gap-2 p-2.5">
        <input
          type="checkbox"
          checked={item.checked}
          onChange={(e) => onToggle(item.id, e.target.checked)}
          className="mt-0.5 w-3.5 h-3.5 rounded border-stone-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer flex-shrink-0"
        />
        <div className="flex-1 min-w-0 space-y-1">
          <p className={`text-xs leading-relaxed ${isFaded ? "line-through text-stone-400" : "text-stone-700"}`}>
            {item.text}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Status badge / picker */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu((v) => !v)}
                className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${cfg.cls}`}
              >
                {cfg.label}
              </button>
              {showStatusMenu && (
                <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-stone-200 rounded-lg shadow-lg py-1 min-w-28">
                  {CHECKLIST_STATUSES.map((s) => {
                    const sc = STATUS_CFG[s];
                    return (
                      <button
                        key={s}
                        onClick={() => { onUpdateStatus(item.id, s); setShowStatusMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-stone-50 flex items-center gap-2 ${s === item.status ? "font-semibold" : ""}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.cls.split(" ")[1].replace("border-", "bg-")}`} />
                        {sc.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Assignee */}
            <div className="relative">
              <button
                onClick={() => setShowAssigneeMenu((v) => !v)}
                className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
                title={assignee ? assignee.name ?? "Assigned" : "Assign"}
              >
                {assignee
                  ? <Avatar name={assignee.name} image={assignee.image} size="xs" />
                  : <span className="flex items-center gap-0.5"><UserPlus className="w-3 h-3" /></span>
                }
              </button>
              {showAssigneeMenu && (
                <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-stone-200 rounded-lg shadow-lg py-1 min-w-36 max-h-44 overflow-y-auto">
                  {item.assigneeId && (
                    <button
                      onClick={() => { onUpdateAssignee(item.id, null); setShowAssigneeMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-50"
                    >
                      Remove assignee
                    </button>
                  )}
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { onUpdateAssignee(item.id, u.id); setShowAssigneeMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-stone-50 flex items-center gap-2 ${u.id === item.assigneeId ? "text-sky-600 font-medium" : "text-stone-700"}`}
                    >
                      <Avatar name={u.name} image={u.image} size="xs" />
                      {u.name ?? "–"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Activity chips */}
            {item.activities.map((act) => (
              <Link
                key={act.id}
                href="/activities"
                className="text-[9px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded flex items-center gap-1 hover:bg-sky-100 transition-colors"
                title={act.title}
              >
                <Calendar className="w-2.5 h-2.5" />
                {new Date(act.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </Link>
            ))}
            {/* Schedule button — always available */}
            <button
              onClick={() => { setScheduling((v) => !v); setActTitle(item.text); }}
              className="text-[9px] text-stone-400 hover:text-sky-600 flex items-center gap-0.5 transition-colors"
            >
              <Calendar className="w-2.5 h-2.5" />
              + Activity
            </button>

            {/* Notes indicator */}
            {item.notes && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-[9px] text-stone-400 hover:text-stone-600 flex items-center gap-0.5">
                <FileText className="w-2.5 h-2.5" />
                Notes
              </button>
            )}
          </div>
        </div>

        {/* Item actions (hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
          <button
            onClick={() => { setExpanded(true); setEditingNotes(true); setNotesDraft(item.notes ?? ""); }}
            className="p-0.5 text-stone-300 hover:text-stone-500 transition-colors"
            title="Add/edit notes"
          >
            <FileText className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-0.5 text-stone-300 hover:text-red-400 transition-colors"
            title="Delete item"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expanded: notes + schedule form */}
      {(expanded || scheduling) && (
        <div className="px-2.5 pb-2.5 ml-6 space-y-2 border-t border-stone-50 pt-2">
          {/* Notes */}
          {expanded && (
            editingNotes ? (
              <div className="space-y-1.5">
                <textarea
                  autoFocus
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Add notes..."
                  className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-sky-400"
                  rows={2}
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => { onUpdateNotes(item.id, notesDraft); setEditingNotes(false); }}
                    className="px-2 py-1 text-[10px] bg-sky-500 text-white rounded hover:bg-sky-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingNotes(false); setNotesDraft(item.notes ?? ""); if (!item.notes) setExpanded(false); }}
                    className="px-2 py-1 text-[10px] text-stone-500 hover:text-stone-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : item.notes ? (
              <div>
                <p className="text-[10px] text-stone-500 leading-relaxed">{item.notes}</p>
                <button onClick={() => setEditingNotes(true)} className="text-[10px] text-sky-500 hover:text-sky-700 mt-1">
                  Edit notes
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingNotes(true)} className="text-[10px] text-stone-400 hover:text-stone-600 italic">
                Add notes…
              </button>
            )
          )}

          {/* Schedule activity */}
          {scheduling && (
            <div className="space-y-1.5 pt-1 border-t border-stone-100">
              <p className="text-[10px] font-semibold text-stone-600">Schedule Activity</p>
              <input
                type="text"
                value={actTitle}
                onChange={(e) => setActTitle(e.target.value)}
                placeholder="Activity title"
                className="w-full px-2 py-1 text-xs border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <input
                type="datetime-local"
                value={actDate}
                onChange={(e) => setActDate(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <div className="flex gap-1">
                <button
                  onClick={handleSchedule}
                  disabled={!actDate || savingActivity}
                  className="px-2 py-1 text-[10px] bg-sky-500 text-white rounded hover:bg-sky-600 disabled:opacity-50"
                >
                  {savingActivity ? "Creating…" : "Create Activity"}
                </button>
                <button onClick={() => setScheduling(false)} className="px-2 py-1 text-[10px] text-stone-500 hover:text-stone-700">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PitstopDetail({
  pitstop: initialPitstop,
  users,
  siblingPitstops,
  currentUserId,
  currentUserName,
  subscribedThreadIds: initialSubscribedThreadIds,
  preferredLang: initialPreferredLang,
}: Props) {
  const searchParams = useSearchParams();
  const [pitstop, setPitstop] = useState(initialPitstop);
  const [preferredLang, setPreferredLang] = useState(initialPreferredLang);
  useEffect(() => {
    fetch("/api/account/language").then((r) => r.json()).then((d) => {
      if (d.lang) setPreferredLang(d.lang);
    }).catch(() => {});
  }, []);

  const threadParam = searchParams.get("thread");
  const [activeThread, setActiveThread] = useState<string | null>(
    threadParam && initialPitstop.threads.some((t) => t.id === threadParam)
      ? threadParam
      : initialPitstop.threads[0]?.id ?? null
  );
  const [mobileView, setMobileView] = useState<"sidebar" | "checklist" | "thread">(
    threadParam ? "thread" : "checklist"
  );

  const [showEdit, setShowEdit] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const [startDate, setStartDate] = useState(toDateInput(initialPitstop.startDate));
  const [targetDate, setTargetDate] = useState(toDateInput(initialPitstop.targetDate));
  const [savingDates, setSavingDates] = useState(false);
  const [datesError, setDatesError] = useState("");
  const [newThreadName, setNewThreadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set(initialSubscribedThreadIds));
  const [verifying, setVerifying] = useState(false);
  const [dateReason, setDateReason] = useState("");
  const [newCheckItem, setNewCheckItem] = useState("");
  const [addingCheck, setAddingCheck] = useState(false);
  const [showDepPicker, setShowDepPicker] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(pitstop.title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentThread = pitstop.threads.find((t) => t.id === activeThread);
  const checkedCount = pitstop.checklistItems.filter((i) => i.checked).length;
  const totalCount = pitstop.checklistItems.length;
  const isBlocked = pitstop.blockedBy.some((d) => d.blockedBy.status !== "Done");
  const availableBlockers = siblingPitstops.filter(
    (s) => s.id !== pitstop.id && !pitstop.blockedBy.some((d) => d.blockedBy.id === s.id)
  );

  // ── Title editing ───────────────────────────────────────────────────────────

  const startEditTitle = () => { setEditTitle(pitstop.title); setEditingTitle(true); setTimeout(() => titleInputRef.current?.focus(), 0); };
  const commitTitle = async () => {
    setEditingTitle(false);
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === pitstop.title) return;
    setPitstop((p) => ({ ...p, title: trimmed }));
    await fetch(`/api/pitstops/${pitstop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  };
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commitTitle();
    if (e.key === "Escape") { setEditingTitle(false); setEditTitle(pitstop.title); }
  };

  // ── Checklist handlers ──────────────────────────────────────────────────────

  const handleAddCheckItem = async () => {
    if (!newCheckItem.trim()) return;
    setAddingCheck(true);
    const res = await fetch(`/api/pitstops/${pitstop.id}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newCheckItem.trim() }),
    });
    if (res.ok) {
      const item = await res.json();
      setPitstop((p) => ({
        ...p,
        checklistItems: [...p.checklistItems, { ...item, status: item.status ?? "NotStarted", assigneeId: item.assigneeId ?? null, notes: item.notes ?? null, activities: [] }],
      }));
      setNewCheckItem("");
    }
    setAddingCheck(false);
  };

  const handleToggleCheck = async (itemId: string, checked: boolean) => {
    const newItems = pitstop.checklistItems.map((i) =>
      i.id === itemId ? { ...i, checked, status: checked ? "Done" : "NotStarted" } : i
    );
    let newStatus: Pitstop["status"] | null = null;
    if (newItems.length > 0) {
      const allChecked = newItems.every((i) => i.checked);
      const anyChecked = newItems.some((i) => i.checked);
      const derived: Pitstop["status"] = allChecked ? "Done" : anyChecked ? "InProgress" : "Upcoming";
      if (derived !== pitstop.status) newStatus = derived;
    }
    setPitstop((p) => ({ ...p, checklistItems: newItems, ...(newStatus ? { status: newStatus } : {}) }));
    const calls: Promise<Response>[] = [
      fetch(`/api/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      }),
    ];
    if (newStatus) {
      calls.push(fetch(`/api/pitstops/${pitstop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      }));
    }
    await Promise.all(calls);
  };

  const handleUpdateItemStatus = async (itemId: string, status: string) => {
    setPitstop((p) => ({
      ...p,
      checklistItems: p.checklistItems.map((i) =>
        i.id === itemId ? { ...i, status, checked: status === "Done" ? true : i.checked } : i
      ),
    }));
    await fetch(`/api/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const handleUpdateItemAssignee = async (itemId: string, assigneeId: string | null) => {
    setPitstop((p) => ({
      ...p,
      checklistItems: p.checklistItems.map((i) => i.id === itemId ? { ...i, assigneeId } : i),
    }));
    await fetch(`/api/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId }),
    });
  };

  const handleUpdateItemNotes = async (itemId: string, notes: string) => {
    setPitstop((p) => ({
      ...p,
      checklistItems: p.checklistItems.map((i) => i.id === itemId ? { ...i, notes: notes || null } : i),
    }));
    await fetch(`/api/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes || null }),
    });
  };

  const handleActivityCreated = (itemId: string, activity: ActivityRef) => {
    setPitstop((p) => ({
      ...p,
      checklistItems: p.checklistItems.map((i) =>
        i.id === itemId ? { ...i, activities: [...i.activities, activity], status: "Scheduled" } : i
      ),
    }));
  };

  const handleDeleteCheckItem = async (itemId: string) => {
    setPitstop((p) => ({ ...p, checklistItems: p.checklistItems.filter((i) => i.id !== itemId) }));
    await fetch(`/api/checklist/${itemId}`, { method: "DELETE" });
  };

  // ── Dependency handlers ─────────────────────────────────────────────────────

  const handleAddDep = async (blockedById: string) => {
    const res = await fetch(`/api/pitstops/${pitstop.id}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedById }),
    });
    if (res.ok) {
      const blocker = siblingPitstops.find((p) => p.id === blockedById)!;
      const dep = await res.json();
      setPitstop((p) => ({ ...p, blockedBy: [...p.blockedBy, { id: dep.id, blockedBy: blocker }] }));
    }
    setShowDepPicker(false);
  };

  const handleRemoveDep = async (blockedById: string) => {
    setPitstop((p) => ({ ...p, blockedBy: p.blockedBy.filter((d) => d.blockedBy.id !== blockedById) }));
    await fetch(`/api/pitstops/${pitstop.id}/dependencies`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedById }),
    });
  };

  // ── Thread handlers ─────────────────────────────────────────────────────────

  const handleCreateThread = async () => {
    if (!newThreadName.trim()) return;
    const res = await fetch(`/api/pitstops/${pitstop.id}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newThreadName.trim() }),
    });
    if (res.ok) {
      const thread = await res.json();
      setPitstop((p) => ({ ...p, threads: [...p.threads, thread] }));
      setActiveThread(thread.id);
      setNewThreadName("");
      setShowNewThread(false);
    }
  };

  const handleMessageSent = (threadId: string, message: unknown) => {
    const msg = message as Message;
    setPitstop((p) => ({
      ...p,
      threads: p.threads.map((t) => t.id === threadId ? { ...t, messages: [...t.messages, msg] } : t),
    }));
  };

  const handleMessageUpdated = (threadId: string, message: unknown) => {
    const msg = message as Message;
    setPitstop((p) => ({
      ...p,
      threads: p.threads.map((t) =>
        t.id === threadId
          ? { ...t, messages: t.messages.map((m) => m.id === msg.id ? { ...m, ...msg, translating: false } : m) }
          : t
      ),
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("pitstopId", pitstop.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      const att = await res.json();
      setPitstop((p) => ({ ...p, attachments: [...p.attachments, att] }));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleToggleSubscribe = async (threadId: string) => {
    const isSubscribed = subscribedIds.has(threadId);
    setSubscribedIds((prev) => {
      const next = new Set(prev);
      isSubscribed ? next.delete(threadId) : next.add(threadId);
      return next;
    });
    const method = isSubscribed ? "DELETE" : "POST";
    const res = await fetch(`/api/threads/${threadId}/subscribe`, { method });
    if (!res.ok) {
      setSubscribedIds((prev) => {
        const next = new Set(prev);
        isSubscribed ? next.add(threadId) : next.delete(threadId);
        return next;
      });
    }
  };

  const handleOwnerChange = async (ownerId: string) => {
    const newOwner = users.find((u) => u.id === ownerId) ?? null;
    setPitstop((p) => ({ ...p, ownerId, owner: newOwner }));
    await fetch(`/api/pitstops/${pitstop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId }),
    });
  };

  const handleRecurrenceChange = async (recurrence: PitstopRecurrence) => {
    setPitstop((p) => ({ ...p, recurrence }));
    await fetch(`/api/pitstops/${pitstop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurrence }),
    });
  };

  const handleProgressTagChange = async (tag: string | null) => {
    setPitstop((p) => ({ ...p, progressTag: tag }));
    await fetch(`/api/pitstops/${pitstop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progressTag: tag }),
    });
  };

  const handleSaveDates = async () => {
    const goalMax = toDateInput(pitstop.goal.targetDate);
    if (targetDate && goalMax && targetDate > goalMax) {
      setDatesError(`Must be on or before goal deadline (${fmtDate(pitstop.goal.targetDate)})`);
      return;
    }
    setSavingDates(true);
    setDatesError("");
    const res = await fetch(`/api/pitstops/${pitstop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: startDate || null, targetDate: targetDate || null, reason: dateReason || null }),
    });
    setSavingDates(false);
    if (res.ok) {
      const updated = await res.json();
      const fresh = await fetch(`/api/pitstops/${pitstop.id}/date-changes`).then((r) => r.json()).catch(() => pitstop.dateChanges);
      setPitstop((p) => ({ ...p, startDate: updated.startDate, targetDate: updated.targetDate, dateChanges: fresh }));
      setDateReason("");
      setEditingDates(false);
    } else {
      setDatesError("Failed to save.");
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    const res = await fetch(`/api/pitstops/${pitstop.id}/verify`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      setPitstop((p) => ({ ...p, verifiedById: updated.verifiedById, verifiedAt: updated.verifiedAt, verifiedBy: updated.verifiedBy }));
    }
    setVerifying(false);
  };

  const handleSaveEdit = async (data: { title: string; type: string; customType: string; status: string; notes: string }) => {
    const res = await fetch(`/api/pitstops/${pitstop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: data.title, type: data.type, customType: data.type === "Custom" ? data.customType : null, status: data.status, notes: data.notes || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPitstop((p) => ({ ...p, title: updated.title, type: updated.type, customType: updated.customType, status: updated.status, notes: updated.notes }));
      setShowEdit(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Mobile tab strip */}
      <div className="sm:hidden flex border-b border-stone-200 bg-white flex-shrink-0">
        <button
          onClick={() => setMobileView("sidebar")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${mobileView === "sidebar" ? "text-sky-600 border-b-2 border-sky-500" : "text-stone-500"}`}
        >
          Info
        </button>
        <button
          onClick={() => setMobileView("checklist")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${mobileView === "checklist" ? "text-sky-600 border-b-2 border-sky-500" : "text-stone-500"}`}
        >
          Checklist {totalCount > 0 && <span className="text-[10px]">({checkedCount}/{totalCount})</span>}
        </button>
        <button
          onClick={() => setMobileView("thread")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${mobileView === "thread" ? "text-sky-600 border-b-2 border-sky-500" : "text-stone-500"}`}
        >
          Thread
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── LEFT PANEL: pitstop metadata ─────────────────────────────────── */}
        <div className={`${mobileView !== "sidebar" ? "hidden sm:flex" : "flex"} w-full sm:w-52 sm:flex-shrink-0 border-r border-stone-200 bg-white flex-col h-full overflow-y-auto`}>
          {/* Breadcrumb + header */}
          <div className="px-4 pt-5 pb-3 border-b border-stone-100">
            <Link href={`/goals/${pitstop.goal.id}`} className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 mb-3">
              <ChevronLeft className="w-3.5 h-3.5" />
              {pitstop.goal.title}
            </Link>
            <div className="flex items-start gap-1.5">
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={handleTitleKeyDown}
                  className="text-sm font-semibold text-stone-900 leading-snug flex-1 border-b border-sky-400 outline-none bg-transparent"
                />
              ) : (
                <h1
                  className="text-sm font-semibold text-stone-900 leading-snug flex-1 cursor-pointer hover:text-sky-700 transition-colors"
                  onClick={startEditTitle}
                  title="Click to edit title"
                >
                  {pitstop.title}
                </h1>
              )}
              <button onClick={() => setShowEdit(true)} className="p-1 text-stone-300 hover:text-stone-600 transition-colors flex-shrink-0 mt-0.5">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <PitstopStatusBadge status={pitstop.status} />
              {isBlocked && (
                <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  <Lock className="w-2.5 h-2.5" />
                  Blocked
                </span>
              )}
            </div>
            <div className="mt-1">
              <PitstopTypeBadge type={pitstop.type as Parameters<typeof PitstopTypeBadge>[0]["type"]} customType={pitstop.customType} />
            </div>
            <div className="mt-2">
              <p className="text-[10px] text-stone-400 mb-0.5">Owner</p>
              <OwnerPicker users={users} value={pitstop.ownerId} onChange={handleOwnerChange} />
            </div>
          </div>

          {/* Notes */}
          <div className="px-4 py-3 border-b border-stone-100">
            {pitstop.notes
              ? <p className="text-xs text-stone-500 leading-relaxed">{pitstop.notes}</p>
              : <button onClick={() => setShowEdit(true)} className="text-xs text-stone-300 hover:text-stone-500 italic">Add notes…</button>
            }
          </div>

          {/* Dependencies */}
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-500 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                Blocked by
              </span>
              {availableBlockers.length > 0 && (
                <button onClick={() => setShowDepPicker((v) => !v)} className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-0.5">
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            {showDepPicker && (
              <div className="mb-2 bg-stone-50 border border-stone-200 rounded-lg overflow-hidden">
                {availableBlockers.map((s) => (
                  <button key={s.id} onClick={() => handleAddDep(s.id)} className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.status === "Done" ? "bg-emerald-400" : s.status === "InProgress" ? "bg-sky-400" : "bg-stone-300"}`} />
                    {s.title}
                  </button>
                ))}
              </div>
            )}
            {pitstop.blockedBy.length === 0 ? (
              <p className="text-xs text-stone-400">No blockers.</p>
            ) : (
              <div className="space-y-1">
                {pitstop.blockedBy.map((dep) => (
                  <div key={dep.id} className="flex items-center gap-2 group">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dep.blockedBy.status === "Done" ? "bg-emerald-400" : dep.blockedBy.status === "InProgress" ? "bg-sky-400" : "bg-stone-300"}`} />
                    <Link
                      href={`/goals/${pitstop.goal.id}/pitstops/${dep.blockedBy.id}`}
                      className={`flex-1 text-xs truncate hover:text-sky-600 ${dep.blockedBy.status === "Done" ? "line-through text-stone-400" : "text-stone-700"}`}
                    >
                      {dep.blockedBy.title}
                    </Link>
                    {dep.blockedBy.status === "Done" && <Unlock className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                    <button onClick={() => handleRemoveDep(dep.blockedBy.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-0.5 text-stone-300 hover:text-red-400 active:text-red-400 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Timeline
              </span>
              <button onClick={() => { setEditingDates((v) => !v); setDatesError(""); }} className="text-xs text-sky-600 hover:text-sky-700">
                {editingDates ? "Cancel" : "Edit"}
              </button>
            </div>
            {editingDates ? (
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-0.5">Start date</label>
                  <input type="date" value={startDate} max={toDateInput(pitstop.goal.targetDate) || undefined} onChange={(e) => setStartDate(e.target.value)} className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-0.5">
                    Target date {pitstop.goal.targetDate && <span className="text-stone-300 ml-1">≤ {fmtDate(pitstop.goal.targetDate)}</span>}
                  </label>
                  <input type="date" value={targetDate} max={toDateInput(pitstop.goal.targetDate) || undefined} onChange={(e) => setTargetDate(e.target.value)} className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-0.5">Reason <span className="text-stone-300">(optional)</span></label>
                  <input type="text" value={dateReason} onChange={(e) => setDateReason(e.target.value)} placeholder="e.g. Field visit rescheduled" className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                </div>
                {datesError && <p className="text-[10px] text-red-500">{datesError}</p>}
                <button onClick={handleSaveDates} disabled={savingDates} className="w-full py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-md transition-colors">
                  {savingDates ? "Saving..." : "Save dates"}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {(() => {
                  const chip = timelineChip(getTimelineInfo(pitstop));
                  return chip ? <span className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border ${chip.cls}`}>{chip.label}</span> : null;
                })()}
                <div className="flex flex-col gap-0.5 text-xs text-stone-500 mt-1">
                  {pitstop.startDate && <span>Start: <span className="text-stone-700">{fmtDate(pitstop.startDate)}</span></span>}
                  {pitstop.targetDate && <span>Target: <span className="text-stone-700">{fmtDate(pitstop.targetDate)}</span></span>}
                  {pitstop.completedAt && <span>Completed: <span className="text-stone-700">{fmtDate(pitstop.completedAt)}</span></span>}
                  {!pitstop.startDate && !pitstop.targetDate && <span className="text-stone-400">No dates set</span>}
                </div>
              </div>
            )}
          </div>

          {/* Verification */}
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verification
              </span>
            </div>
            {pitstop.verifiedById ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Avatar name={pitstop.verifiedBy?.name} image={pitstop.verifiedBy?.image} size="xs" />
                  <div>
                    <p className="text-[10px] text-emerald-700 font-medium">Verified by {pitstop.verifiedBy?.name ?? "—"}</p>
                    <p className="text-[10px] text-stone-400">{pitstop.verifiedAt ? fmtDate(pitstop.verifiedAt) : ""}</p>
                  </div>
                </div>
                {pitstop.verifiedById === currentUserId && (
                  <button onClick={handleVerify} disabled={verifying} className="text-[10px] text-stone-400 hover:text-red-500 transition-colors">Remove</button>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs text-stone-400 mb-2">Mark this pitstop as verified once you&apos;ve reviewed the work.</p>
                <button onClick={handleVerify} disabled={verifying} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-stone-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors disabled:opacity-50">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {verifying ? "Verifying…" : "Verify"}
                </button>
              </div>
            )}
          </div>

          {/* Date change log */}
          {pitstop.dateChanges.length > 0 && (
            <div className="px-4 py-3 border-b border-stone-100">
              <span className="text-xs font-medium text-stone-500 flex items-center gap-1 mb-2">
                <History className="w-3.5 h-3.5" />
                Date change log
              </span>
              <div className="space-y-2">
                {pitstop.dateChanges.map((dc) => (
                  <div key={dc.id} className="text-[10px] text-stone-500 border-l-2 border-stone-200 pl-2">
                    <span className="font-medium text-stone-700">{dc.field === "targetDate" ? "Target" : "Start"}</span>
                    {" "}{fmtDate(dc.oldDate)} → {fmtDate(dc.newDate)}
                    {dc.reason && <span className="ml-1 italic text-stone-400">&ldquo;{dc.reason}&rdquo;</span>}
                    <div className="text-stone-400 mt-0.5">{dc.changedBy.name} · {fmtDate(dc.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <RetrospectiveSection entityType="Pitstop" entityId={pitstop.id} />
          <EscalationSection pitstopId={pitstop.id} users={users} />
          <CoOwnersSection pitstopId={pitstop.id} users={users} />
          <ThemesSection pitstopId={pitstop.id} />
          <GeographySection pitstopId={pitstop.id} initialZoneId={pitstop.needsZoneId} initialClusterId={pitstop.needsClusterId} initialSettlementId={pitstop.needsSettlementId} />
          <AuditSection entityType="Pitstop" entityId={pitstop.id} />

          {/* Recurrence */}
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center gap-1.5 mb-2">
              <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-xs font-medium text-stone-500">Recurrence</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["None", "Weekly", "Monthly", "Quarterly"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRecurrenceChange(r)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${pitstop.recurrence === r ? "bg-stone-900 text-white border-stone-900" : "text-stone-500 border-stone-200 hover:border-stone-300 hover:bg-stone-50"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            {pitstop.recurrence !== "None" && (
              <p className="text-[10px] text-stone-400 mt-1.5 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5" />
                A new pitstop will be created automatically when this one is marked Done.
              </p>
            )}
          </div>

          {/* Progress Tag */}
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs font-medium text-stone-500">Phase</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {PROGRESS_TAGS.map((tag) => {
                const active = pitstop.progressTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => handleProgressTagChange(active ? null : tag)}
                    className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${active ? TAG_COLORS[tag] + " font-medium" : "text-stone-400 border-stone-200 hover:border-stone-300 hover:bg-stone-50"}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Attachments */}
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-500">Files</span>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1">
                <Upload className="w-3 h-3" />
                {uploading ? "..." : "Upload"}
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            </div>
            {pitstop.attachments.length === 0 ? (
              <p className="text-xs text-stone-400">No files attached.</p>
            ) : (
              <div className="space-y-1">
                {pitstop.attachments.map((att) => (
                  <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 truncate">
                    <Paperclip className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{att.name}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Threads list */}
          <div className="flex-1 px-3 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-stone-500">Threads</span>
              <button onClick={() => setShowNewThread(true)} className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
            {showNewThread && (
              <div className="mb-2 flex gap-1">
                <input
                  autoFocus
                  type="text"
                  value={newThreadName}
                  onChange={(e) => setNewThreadName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateThread(); if (e.key === "Escape") { setShowNewThread(false); setNewThreadName(""); } }}
                  placeholder="Thread name..."
                  className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
                <button onClick={handleCreateThread} className="p-1 text-sky-600 hover:text-sky-700"><Plus className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setShowNewThread(false); setNewThreadName(""); }} className="p-1 text-stone-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <div className="space-y-0.5">
              {pitstop.threads.map((thread) => (
                <div key={thread.id} className="flex items-center gap-1">
                  <button
                    onClick={() => { setActiveThread(thread.id); setMobileView("thread"); }}
                    className={`flex-1 text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${activeThread === thread.id ? "bg-sky-50 text-sky-700 font-medium" : "text-stone-600 hover:bg-stone-50"}`}
                  >
                    <span className="text-stone-400 mr-1">#</span>
                    {thread.name}
                    <span className={`ml-1 ${activeThread === thread.id ? "text-sky-400" : "text-stone-300"}`}>
                      {thread.messages.length > 0 && `(${thread.messages.length})`}
                    </span>
                  </button>
                  <button onClick={() => handleToggleSubscribe(thread.id)} title={subscribedIds.has(thread.id) ? "Unsubscribe" : "Subscribe"} className={`p-1 rounded transition-colors ${subscribedIds.has(thread.id) ? "text-sky-500 hover:text-stone-400" : "text-stone-300 hover:text-sky-500"}`}>
                    {subscribedIds.has(thread.id) ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Delete this thread and all its messages?")) return;
                      const res = await fetch(`/api/threads/${thread.id}`, { method: "DELETE" });
                      if (res.ok) {
                        const remaining = pitstop.threads.filter((t) => t.id !== thread.id);
                        setPitstop((p) => ({ ...p, threads: remaining }));
                        if (activeThread === thread.id) setActiveThread(remaining[0]?.id ?? null);
                      }
                    }}
                    title="Delete thread"
                    className="p-1 rounded text-stone-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {pitstop.threads.length === 0 && !showNewThread && (
                <p className="text-xs text-stone-400 px-2">No threads yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── CENTRE PANEL: checklist ───────────────────────────────────────── */}
        <div className={`${mobileView !== "checklist" ? "hidden sm:flex" : "flex"} w-full sm:w-80 sm:flex-shrink-0 border-r border-stone-200 bg-white flex-col h-full`}>
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-stone-100 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-stone-400" />
                Checklist
                {totalCount > 0 && (
                  <span className="text-stone-400 font-normal">{checkedCount}/{totalCount}</span>
                )}
              </span>
              {totalCount > 0 && (
                <span className="text-[10px] text-stone-400">{Math.round((checkedCount / totalCount) * 100)}%</span>
              )}
            </div>
            {totalCount > 0 && (
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all"
                  style={{ width: `${Math.round((checkedCount / totalCount) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {pitstop.checklistItems.length === 0 ? (
              <div className="text-center py-10">
                <CheckSquare className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                <p className="text-xs text-stone-400">No checklist items yet.</p>
                <p className="text-[10px] text-stone-300 mt-1">Add items below to track progress.</p>
              </div>
            ) : (
              pitstop.checklistItems.map((item) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  users={users}
                  pitstopId={pitstop.id}
                  onToggle={handleToggleCheck}
                  onUpdateStatus={handleUpdateItemStatus}
                  onUpdateAssignee={handleUpdateItemAssignee}
                  onUpdateNotes={handleUpdateItemNotes}
                  onDelete={handleDeleteCheckItem}
                  onActivityCreated={handleActivityCreated}
                />
              ))
            )}
          </div>

          {/* Add item */}
          <div className="px-3 py-3 border-t border-stone-100 flex-shrink-0">
            <div className="flex gap-1">
              <input
                type="text"
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddCheckItem(); if (e.key === "Escape") setNewCheckItem(""); }}
                placeholder="Add checklist item…"
                className="flex-1 px-2 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <button
                onClick={handleAddCheckItem}
                disabled={!newCheckItem.trim() || addingCheck}
                className="p-1.5 text-sky-600 hover:text-sky-700 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: thread messages ──────────────────────────────────── */}
        <div className={`${mobileView !== "thread" ? "hidden sm:flex" : "flex"} flex-1 flex-col h-full overflow-hidden`}>
          {currentThread ? (
            <>
              <div className="px-4 sm:px-6 py-4 border-b border-stone-200 bg-white flex-shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-stone-900 truncate">
                      <span className="text-stone-400 mr-1">#</span>{currentThread.name}
                    </h2>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {currentThread.messages.length} message{currentThread.messages.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleSubscribe(currentThread.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${subscribedIds.has(currentThread.id) ? "bg-sky-50 text-sky-700 hover:bg-sky-100" : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"}`}
                >
                  {subscribedIds.has(currentThread.id)
                    ? <><BellOff className="w-3.5 h-3.5" /> Subscribed</>
                    : <><Bell className="w-3.5 h-3.5" /> Subscribe</>
                  }
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
                {currentThread.messages.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-stone-400 text-sm">No messages yet. Start the conversation.</p>
                  </div>
                ) : (
                  currentThread.messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} isOwn={msg.author.id === currentUserId} preferredLang={preferredLang} />
                  ))
                )}
              </div>
              <div className="flex-shrink-0 border-t border-stone-200 bg-white px-4 sm:px-6 py-4">
                <MessageComposer
                  threadId={currentThread.id}
                  users={users}
                  onSent={(msg) => handleMessageSent(currentThread.id, msg)}
                  onMessageUpdated={(msg) => handleMessageUpdated(currentThread.id, msg)}
                  preferredLang={preferredLang}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-stone-400 text-sm">Select or create a thread to start discussing.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit pitstop modal */}
      {showEdit && (
        <EditPitstopModal
          pitstop={pitstop}
          onClose={() => setShowEdit(false)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

const PITSTOP_TYPES = [
  "Meeting", "Training", "SiteVisit", "Discussion",
  "AppDevelopment", "Budgeting", "Proposal", "Research", "Review", "Custom",
];
const PITSTOP_TYPE_LABELS: Record<string, string> = {
  SiteVisit: "Site Visit", AppDevelopment: "App Development",
};

function EditPitstopModal({
  pitstop,
  onClose,
  onSave,
}: {
  pitstop: Pitstop;
  onClose: () => void;
  onSave: (data: { title: string; type: string; customType: string; status: string; notes: string }) => Promise<void>;
}) {
  const [title, setTitle]         = useState(pitstop.title);
  const [type, setType]           = useState(pitstop.type);
  const [customType, setCustomType] = useState(pitstop.customType ?? "");
  const [status, setStatus]       = useState<"Upcoming" | "InProgress" | "Done">(pitstop.status);
  const [notes, setNotes]         = useState(pitstop.notes ?? "");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (type === "Custom" && !customType.trim()) { setError("Enter a name for the custom type."); return; }
    setLoading(true);
    await onSave({ title: title.trim(), type, customType: customType.trim(), status, notes });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-900">Edit Pitstop</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-stone-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                {PITSTOP_TYPES.map((t) => <option key={t} value={t}>{PITSTOP_TYPE_LABELS[t] ?? t}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as "Upcoming" | "InProgress" | "Done")}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                <option value="Upcoming">Upcoming</option>
                <option value="InProgress">In Progress</option>
                <option value="Done">Done</option>
              </select>
            </div>
          </div>
          {type === "Custom" && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Custom type name</label>
              <input value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="e.g. Workshop"
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add notes…"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2 text-sm font-medium bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg transition-colors">
            {loading ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
