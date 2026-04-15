"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Pencil, Trash2, Paperclip, MessageSquare, Upload, Bell, BellOff, ChevronUp, ChevronDown, ArrowRight, Flag, Calendar, RefreshCw, Lock, X, CheckSquare, ExternalLink, AlertTriangle, Copy, BadgeCheck } from "lucide-react";
import Avatar from "@/components/Avatar";
import { GoalStatusBadge, PitstopStatusBadge } from "@/components/StatusBadge";
import PitstopTypeBadge from "@/components/PitstopTypeBadge";
import CreatePitstopModal from "./CreatePitstopModal";
import EditGoalModal from "./EditGoalModal";
import { getTimelineInfo, timelineChip, timelineNodeBorder, fmtDate, getPitstopHealth, HEALTH_DOT } from "@/lib/timeline";
import OwnerPicker from "@/components/OwnerPicker";
import { qk } from "@/lib/query-keys";
import { fetchGoal } from "@/lib/api-client";
import DecisionsSection from "./DecisionsSection";
import RisksSection from "./RisksSection";
import BroadcastsSection from "./BroadcastsSection";
import MetricsSection from "./MetricsSection";
import GoalCoOwnersSection from "./GoalCoOwnersSection";
import GoalThemesSection from "./GoalThemesSection";
import GoalGeographySection from "./GoalGeographySection";
import GoalNeedsSection from "./GoalNeedsSection";

type Attachment = { id: string; name: string; url: string; type: string };
type Thread = { id: string; name: string; _count: { messages: number } };
type User = { id: string; name: string | null; image: string | null };
type ChecklistItem = { id: string; text: string; checked: boolean };
type PitstopPriority = "High" | "Medium" | "Low";
type Pitstop = {
  id: string;
  title: string;
  type: string;
  customType?: string | null;
  notes: string | null;
  status: "Upcoming" | "InProgress" | "Done";
  priority: PitstopPriority;
  order: number;
  ownerId?: string | null;
  owner?: User | null;
  startDate?: string | null;
  targetDate?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  attachments: Attachment[];
  threads: Thread[];
  checklistItems: ChecklistItem[];
};
type Recurrence = "None" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";
type CoOwner = { userId: string; user: User };
type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: "Active" | "Paused" | "Complete";
  recurrence: Recurrence;
  targetDate?: string | null;
  needsDomain?: string | null;
  parameter?: number | null;
  outcomeCount?: number | null;
  confirmedById?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: User | null;
  owner: User;
  attachments: Attachment[];
  pitstops: Pitstop[];
  coOwners: CoOwner[];
};

export default function GoalDetail({
  goal: initialGoal,
  users,
  currentUserId,
  isFollowing: initialIsFollowing,
}: {
  goal: Goal;
  users: User[];
  currentUserId: string;
  isFollowing: boolean;
}) {
  const [showCreatePitstop, setShowCreatePitstop] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [deletingGoal, setDeletingGoal] = useState(false);
  const [cloningGoal, setCloningGoal] = useState(false);
  const [panelPitstopId, setPanelPitstopId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  // React Query — seed with server data, cache for 60s, re-fetches silently after
  const { data: goal, isFetching } = useQuery<Goal>({
    queryKey: qk.goal(initialGoal.id),
    queryFn: () => fetchGoal(initialGoal.id),
    initialData: initialGoal,
    initialDataUpdatedAt: Date.now(),
  });

  // Local mutation helper — update cache directly for optimistic updates
  const updateGoal = (updater: (g: Goal) => Goal) => {
    queryClient.setQueryData<Goal>(qk.goal(initialGoal.id), (old) => old ? updater(old) : old);
  };

  const [confirming, setConfirming] = useState(false);
  const [recurLoading, setRecurLoading] = useState(false);
  const sortedPitstops = [...(goal?.pitstops ?? [])].sort((a, b) => a.order - b.order);

  // Prefetch pitstop page on hover
  const prefetchPitstop = (pitstopId: string) => {
    router.prefetch(`/goals/${goal!.id}/pitstops/${pitstopId}`);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    const res = await fetch(`/api/goals/${goal.id}/confirm`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      updateGoal((g) => ({
        ...g,
        confirmedById: updated.confirmedById,
        confirmedAt: updated.confirmedAt,
        confirmedBy: updated.confirmedBy,
      }));
    }
    setConfirming(false);
  };

  const handleRecur = async () => {
    setRecurLoading(true);
    const res = await fetch(`/api/goals/${goal.id}/recur`, { method: "POST" });
    setRecurLoading(false);
    if (res.ok) {
      const { goalId: newGoalId } = await res.json();
      router.push(`/goals/${newGoalId}`);
    }
  };

  const handleDeleteGoal = async () => {
    if (!confirm("Delete this goal and all its pitstops?")) return;
    setDeletingGoal(true);
    await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    router.push("/dashboard");
  };

  const handleCloneGoal = async () => {
    setCloningGoal(true);
    const res = await fetch(`/api/goals/${goal.id}/clone`, { method: "POST" });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/goals/${id}`);
    } else {
      setCloningGoal(false);
    }
  };

  const handleToggleFollow = async () => {
    setIsFollowing((f) => !f);
    const method = isFollowing ? "DELETE" : "POST";
    const res = await fetch(`/api/goals/${goal.id}/follow`, { method });
    if (!res.ok) setIsFollowing((f) => !f); // revert on error
  };

  const handleGoalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("goalId", goal.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      const att = await res.json();
      updateGoal((g) => ({ ...g, attachments: [...g.attachments, att] }));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGoalOwnerChange = async (ownerId: string) => {
    const newOwner = users.find((u) => u.id === ownerId)!;
    updateGoal((g) => ({ ...g, owner: newOwner }));
    await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId }),
    });
  };

  const handlePitstopOwnerChange = async (pitstopId: string, ownerId: string) => {
    const newOwner = users.find((u) => u.id === ownerId)!;
    updateGoal((g) => ({
      ...g,
      pitstops: g.pitstops.map((p) =>
        p.id === pitstopId ? { ...p, ownerId, owner: newOwner } : p
      ),
    }));
    await fetch(`/api/pitstops/${pitstopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId }),
    });
  };

  const handleReorder = async (pitstopId: string, direction: "up" | "down") => {
    const sorted = [...goal.pitstops].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((p) => p.id === pitstopId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const reordered = [...sorted];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const withNewOrder = reordered.map((p, i) => ({ ...p, order: i }));

    updateGoal((g) => ({ ...g, pitstops: withNewOrder }));

    await fetch(`/api/goals/${goal.id}/pitstops/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: withNewOrder.map((p) => p.id) }),
    });
  };

  const handlePanelCheckToggle = async (pitstopId: string, itemId: string, checked: boolean) => {
    updateGoal((g) => {
      const pitstops = g.pitstops.map((p) => {
        if (p.id !== pitstopId) return p;
        const newItems = p.checklistItems.map((i) => i.id === itemId ? { ...i, checked } : i);
        // Auto-derive status
        const allChecked = newItems.every((i) => i.checked);
        const anyChecked = newItems.some((i) => i.checked);
        const derived = allChecked ? "Done" : anyChecked ? "InProgress" : "Upcoming";
        return { ...p, checklistItems: newItems, status: newItems.length > 0 ? derived : p.status };
      });
      return { ...g, pitstops };
    });
    const pitstop = goal!.pitstops.find((p) => p.id === pitstopId)!;
    const newItems = pitstop.checklistItems.map((i) => i.id === itemId ? { ...i, checked } : i);
    const allChecked = newItems.every((i) => i.checked);
    const anyChecked = newItems.some((i) => i.checked);
    const derived = allChecked ? "Done" : anyChecked ? "InProgress" : "Upcoming";
    const calls: Promise<Response>[] = [
      fetch(`/api/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      }),
    ];
    if (newItems.length > 0 && derived !== pitstop.status) {
      calls.push(fetch(`/api/pitstops/${pitstopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: derived }),
      }));
    }
    await Promise.all(calls);
  };

  const panelPitstop = panelPitstopId ? sortedPitstops.find((p) => p.id === panelPitstopId) ?? null : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Breadcrumb */}
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 mb-6 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Goals
      </Link>

      {/* Goal header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold text-stone-900">{goal.title}</h1>
              <GoalStatusBadge status={goal.status} />
            </div>
            {goal.description && (
              <p className="text-sm text-stone-500 mt-1">{goal.description}</p>
            )}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <OwnerPicker users={users} value={goal.owner.id} onChange={handleGoalOwnerChange} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleToggleFollow}
              title={isFollowing ? "Unfollow goal" : "Follow goal"}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                isFollowing
                  ? "bg-sky-50 text-sky-700 hover:bg-sky-100"
                  : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              }`}
            >
              {isFollowing ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              {isFollowing ? "Following" : "Follow"}
            </button>
            <button
              onClick={handleCloneGoal}
              disabled={cloningGoal}
              className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-md transition-colors disabled:opacity-50"
              title="Clone goal"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowEditGoal(true)}
              className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-md transition-colors"
              title="Edit goal"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={handleDeleteGoal}
              disabled={deletingGoal}
              className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
              title="Delete goal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {goal.pitstops.length > 0 && (
          <div className="mt-4">
            {(() => {
              const done = goal.pitstops.filter((p) => p.status === "Done").length;
              const progress = Math.round((done / goal.pitstops.length) * 100);
              return (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-xs text-stone-400 flex-shrink-0">{done}/{goal.pitstops.length} done</span>
                </div>
              );
            })()}
          </div>
        )}

        {/* Deadline */}
        {goal.targetDate && (
          <div className="mt-3 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
            <span className="text-xs text-stone-500">
              Deadline: <span className="font-medium text-stone-700">{fmtDate(goal.targetDate)}</span>
            </span>
            {(() => {
              const info = getTimelineInfo({ status: goal.status === "Complete" ? "Done" : "InProgress", targetDate: goal.targetDate });
              const chip = timelineChip(info);
              return chip ? (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${chip.cls}`}>{chip.label}</span>
              ) : null;
            })()}
          </div>
        )}

        {/* Confirmation badge */}
        <div className="mt-3 flex items-center gap-2">
          {goal.confirmedById ? (
            <div className="flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-700">
                Confirmed by {goal.confirmedBy?.name ?? "—"}
                {goal.confirmedAt && <span className="text-emerald-500 font-normal ml-1">· {fmtDate(goal.confirmedAt)}</span>}
              </span>
              {goal.confirmedById === currentUserId && (
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="text-[10px] text-stone-400 hover:text-red-500 ml-1 transition-colors"
                >
                  (remove)
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-stone-200 rounded-lg text-stone-500 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors disabled:opacity-50"
            >
              <BadgeCheck className="w-3.5 h-3.5" />
              {confirming ? "Confirming…" : "Confirm goal"}
            </button>
          )}
        </div>

        {/* Outcome vs planned — shown when goal is complete and has a needs domain */}
        {goal.status === "Complete" && goal.needsDomain && goal.parameter != null && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-stone-400">Outcome:</span>
            {(() => {
              const actual = goal.outcomeCount ?? goal.parameter;
              const planned = goal.parameter;
              const short = planned - actual;
              return (
                <>
                  <span className={`font-semibold ${short > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {actual} {goal.needsDomain.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}s
                  </span>
                  <span className="text-stone-300">·</span>
                  <span className="text-stone-400">planned {planned}</span>
                  {short > 0 && (
                    <span className="text-amber-500 font-medium">{short} short</span>
                  )}
                  {short <= 0 && goal.outcomeCount != null && (
                    <span className="text-emerald-500">target met</span>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Recurrence banner */}
        {goal.status === "Complete" && goal.recurrence && goal.recurrence !== "None" && (
          <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <RefreshCw className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-800">This is a recurring goal</p>
              <p className="text-xs text-emerald-600">Ready to start the next {goal.recurrence.toLowerCase()} cycle?</p>
            </div>
            <button
              onClick={handleRecur}
              disabled={recurLoading}
              className="flex-shrink-0 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {recurLoading ? "Creating..." : "Start next cycle"}
            </button>
          </div>
        )}

        {/* Co-owners, Themes, Geography */}
        <GoalCoOwnersSection
          goalId={goal.id}
          coOwners={goal.coOwners ?? []}
          users={users}
          currentOwnerId={goal.owner.id}
        />
        <GoalThemesSection goalId={goal.id} />
        <GoalGeographySection goalId={goal.id} />
        <GoalNeedsSection goalId={goal.id} />

        {/* Goal-level attachments */}
        <div className="mt-4 pt-4 border-t border-stone-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-500 flex items-center gap-1">
              <Paperclip className="w-3.5 h-3.5" />
              Anchor Documents
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              {uploading ? "Uploading..." : "Attach"}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleGoalFileUpload} />
          </div>
          {goal.attachments.length === 0 ? (
            <p className="text-xs text-stone-400">No anchor documents attached.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {goal.attachments.map((att) => (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-50 border border-stone-200 rounded-md text-xs text-stone-700 hover:text-sky-600 hover:border-sky-200 transition-colors"
                >
                  <Paperclip className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[160px]">{att.name}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Route Map */}
      {sortedPitstops.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">Route Map</h2>
          <RouteMap
            pitstops={sortedPitstops}
            goalTitle={goal!.title}
            goalId={goal!.id}
            onHover={prefetchPitstop}
            onNodeClick={(id) => setPanelPitstopId((prev) => prev === id ? null : id)}
            activePitstopId={panelPitstopId}
          />
        </div>
      )}

      {/* Pitstops list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-stone-700">Pitstops</h2>
        <button
          onClick={() => setShowCreatePitstop(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Pitstop
        </button>
      </div>

      {sortedPitstops.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-stone-200 rounded-xl">
          <p className="text-stone-400 text-sm">No pitstops yet.</p>
          <button
            onClick={() => setShowCreatePitstop(true)}
            className="mt-1 text-sm text-sky-600 hover:text-sky-700"
          >
            Add the first pitstop
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedPitstops.map((pitstop, idx) => (
            <PitstopRow
              key={pitstop.id}
              pitstop={pitstop}
              goalId={goal!.id}
              users={users}
              isFirst={idx === 0}
              isLast={idx === sortedPitstops.length - 1}
              onReorder={handleReorder}
              onHover={prefetchPitstop}
              onOwnerChange={(ownerId) => handlePitstopOwnerChange(pitstop.id, ownerId)}
              onDeleted={(id) => updateGoal((g) => ({ ...g, pitstops: g.pitstops.filter((p) => p.id !== id) }))}
              onUpdated={(updated) =>
                updateGoal((g) => ({ ...g, pitstops: g.pitstops.map((p) => (p.id === updated.id ? updated as Pitstop : p)) }))
              }
              onCloned={(cloned) => updateGoal((g) => ({ ...g, pitstops: [...g.pitstops, cloned as Pitstop] }))}
            />
          ))}
        </div>
      )}

      {/* Checklist panel (Route Map drill-down) */}
      {panelPitstop && (
        <div className="fixed right-0 top-0 bottom-16 sm:bottom-0 w-full sm:w-80 bg-white shadow-2xl border-l border-stone-200 z-40 flex flex-col">
          <div className="flex items-start justify-between px-4 py-4 border-b border-stone-100">
            <div className="min-w-0 pr-2">
              <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-0.5">Checklist</p>
              <h3 className="text-sm font-semibold text-stone-900 leading-snug">{panelPitstop.title}</h3>
            </div>
            <button onClick={() => setPanelPitstopId(null)} className="flex-shrink-0 p-1 text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {panelPitstop.checklistItems.length === 0 ? (
              <p className="text-xs text-stone-400">No checklist items.</p>
            ) : (
              <>
                {(() => {
                  const done = panelPitstop.checklistItems.filter((i) => i.checked).length;
                  const total = panelPitstop.checklistItems.length;
                  return (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                        <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />{done}/{total}</span>
                        <span>{Math.round((done / total) * 100)}%</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  {panelPitstop.checklistItems.map((item) => (
                    <label key={item.id} className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => handlePanelCheckToggle(panelPitstop.id, item.id, e.target.checked)}
                        className="mt-0.5 w-3.5 h-3.5 rounded border-stone-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer flex-shrink-0"
                      />
                      <span className={`text-xs leading-relaxed ${item.checked ? "line-through text-stone-400" : "text-stone-700"}`}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="px-4 py-3 border-t border-stone-100">
            <Link
              href={`/goals/${goal!.id}/pitstops/${panelPitstop.id}`}
              className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors border border-sky-200 hover:border-sky-300"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open full pitstop
            </Link>
          </div>
        </div>
      )}

      {/* Decisions, Risks, Broadcasts, Metrics */}
      <div className="mt-8 space-y-4">
        <DecisionsSection goalId={goal.id} />
        <RisksSection goalId={goal.id} />
        <BroadcastsSection goalId={goal.id} />
        <MetricsSection goalId={goal.id} />
      </div>

      {showCreatePitstop && (
        <CreatePitstopModal
          goalId={goal.id}
          goalTargetDate={goal.targetDate}
          onClose={() => setShowCreatePitstop(false)}
          onCreated={(pitstop) => {
            const p = pitstop as Pitstop;
            const newPitstop = { ...p, order: p.order ?? goal.pitstops.length };
            updateGoal((g) => ({ ...g, pitstops: [...g.pitstops, newPitstop] }));
            setShowCreatePitstop(false);
          }}
        />
      )}

      {showEditGoal && (
        <EditGoalModal
          goal={goal}
          onClose={() => setShowEditGoal(false)}
          onUpdated={(updated) => updateGoal((g) => ({ ...g, ...updated }))}
        />
      )}
    </div>
  );
}

// ── Route Map ────────────────────────────────────────────────────────────────

const statusColor: Record<string, string> = {
  Done: "bg-emerald-50 border-emerald-200 text-emerald-700",
  InProgress: "bg-sky-50 border-sky-200 text-sky-700",
  Upcoming: "bg-stone-50 border-stone-200 text-stone-500",
};

function RouteMap({ pitstops, goalTitle, goalId, onHover, onNodeClick, activePitstopId }: {
  pitstops: Pitstop[];
  goalTitle: string;
  goalId: string;
  onHover: (id: string) => void;
  onNodeClick: (id: string) => void;
  activePitstopId: string | null;
}) {
  return (
    <div className="overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex items-center gap-0 min-w-max">
        {pitstops.map((pitstop, idx) => {
          const tlInfo = getTimelineInfo(pitstop);
          const tlBorder = timelineNodeBorder(tlInfo);
          const tlChip = timelineChip(tlInfo);
          const hasChecklist = pitstop.checklistItems.length > 0;
          const doneCount = pitstop.checklistItems.filter((i) => i.checked).length;
          const isActive = activePitstopId === pitstop.id;
          const health = getPitstopHealth(pitstop);
          return (
          <div key={pitstop.id} className="flex items-center">
            <button
              onMouseEnter={() => onHover(pitstop.id)}
              onTouchStart={() => onHover(pitstop.id)}
              onClick={() => onNodeClick(pitstop.id)}
              className={`relative flex flex-col gap-1 px-3 py-2.5 rounded-xl border-2 text-left w-36 hover:shadow-sm transition-all ${statusColor[pitstop.status]} ${tlBorder} ${isActive ? "ring-2 ring-sky-400 ring-offset-1" : ""}`}
            >
              {health !== "none" && (
                <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${HEALTH_DOT[health]}`} title={`Health: ${health}`} />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">#{idx + 1}</span>
              <span className="text-xs font-medium leading-snug line-clamp-2">{pitstop.title}</span>
              <div className="flex items-center gap-1 flex-wrap">
                <PitstopTypeBadge type={pitstop.type as Parameters<typeof PitstopTypeBadge>[0]["type"]} customType={pitstop.customType} />
                {tlChip && (
                  <span className={`text-[9px] font-medium px-1 py-0.5 rounded border ${tlChip.cls}`}>{tlChip.label}</span>
                )}
                {hasChecklist && (
                  <span className="flex items-center gap-0.5 text-[9px] font-medium opacity-70">
                    <CheckSquare className="w-2.5 h-2.5" />
                    {doneCount}/{pitstop.checklistItems.length}
                  </span>
                )}
              </div>
            </button>
            <ArrowRight className="w-4 h-4 text-stone-300 mx-1 flex-shrink-0" />
          </div>
          );
        })}

        {/* Goal node */}
        <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-sky-300 bg-sky-500 text-white w-36">
          <Flag className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-xs font-semibold line-clamp-2">{goalTitle}</span>
        </div>
      </div>
    </div>
  );
}

// ── Pitstop Row ──────────────────────────────────────────────────────────────

function PitstopRow({
  pitstop,
  goalId,
  users,
  isFirst,
  isLast,
  onReorder,
  onHover,
  onOwnerChange,
  onDeleted,
  onUpdated,
  onCloned,
}: {
  pitstop: Pitstop;
  goalId: string;
  users: User[];
  isFirst: boolean;
  isLast: boolean;
  onReorder: (id: string, dir: "up" | "down") => void;
  onHover: (id: string) => void;
  onOwnerChange: (ownerId: string) => void;
  onDeleted: (id: string) => void;
  onUpdated: (p: Pitstop) => void;
  onCloned: (p: Pitstop) => void;
}) {
  const totalMessages = pitstop.threads.reduce((sum, t) => sum + t._count.messages, 0);
  const items = pitstop.checklistItems ?? [];
  const incompleteItems = items.filter((i) => !i.checked).length;
  const hasChecklist = items.length > 0;
  const checkedCount = items.filter((i) => i.checked).length;
  const [cloning, setCloning] = useState(false);

  const handleClone = async () => {
    setCloning(true);
    const res = await fetch(`/api/pitstops/${pitstop.id}/clone`, { method: "POST" });
    if (res.ok) {
      const cloned = await res.json();
      onCloned(cloned as Pitstop);
    }
    setCloning(false);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this pitstop?")) return;
    await fetch(`/api/pitstops/${pitstop.id}`, { method: "DELETE" });
    onDeleted(pitstop.id);
  };

  const handleStatusChange = async (status: string) => {
    if (status === "Done" && hasChecklist && incompleteItems > 0) return; // blocked
    const previous = pitstop;
    onUpdated({ ...pitstop, status: status as Pitstop["status"] }); // optimistic
    const res = await fetch(`/api/pitstops/${pitstop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) onUpdated(previous); // revert on error
  };

  return (
    <div className="bg-white border border-stone-200 rounded-lg hover:border-stone-300 transition-all flex">
      {/* Reorder controls */}
      <div className="flex flex-col items-center justify-center px-2 py-2 bg-stone-50 rounded-l-lg border-r border-stone-200 gap-1">
        <button
          onClick={() => onReorder(pitstop.id, "up")}
          disabled={isFirst}
          className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title="Move up"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onReorder(pitstop.id, "down")}
          disabled={isLast}
          className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title="Move down"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <Link href={`/goals/${goalId}/pitstops/${pitstop.id}`} onMouseEnter={() => onHover(pitstop.id)} onTouchStart={() => onHover(pitstop.id)} className="flex items-start gap-3 px-4 py-3.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              {(() => {
                const h = getPitstopHealth(pitstop);
                return h !== "none" ? <span className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_DOT[h]}`} title={`Health: ${h}`} /> : null;
              })()}
              <span className="text-sm font-medium text-stone-900">{pitstop.title}</span>
              <PitstopStatusBadge status={pitstop.status} />
              {pitstop.priority !== "Medium" && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${pitstop.priority === "High" ? "bg-red-50 border-red-200 text-red-600" : "bg-stone-50 border-stone-200 text-stone-400"}`}>
                  {pitstop.priority}
                </span>
              )}
              {(() => {
                const chip = timelineChip(getTimelineInfo(pitstop));
                return chip ? (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${chip.cls}`}>{chip.label}</span>
                ) : null;
              })()}
            </div>
            <PitstopTypeBadge type={pitstop.type as Parameters<typeof PitstopTypeBadge>[0]["type"]} customType={pitstop.customType} />
            {pitstop.notes && (
              <p className="text-xs text-stone-500 mt-1 line-clamp-2">{pitstop.notes}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              {pitstop.threads.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-stone-400">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {totalMessages} message{totalMessages !== 1 ? "s" : ""}
                </span>
              )}
              {pitstop.attachments.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-stone-400">
                  <Paperclip className="w-3.5 h-3.5" />
                  {pitstop.attachments.length}
                </span>
              )}
            </div>
          </div>
        </Link>

        <div className="border-t border-stone-100 px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {(["Upcoming", "InProgress", "Done"] as const).map((s) => {
              const blocked = s === "Done" && hasChecklist && incompleteItems > 0;
              return (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={blocked}
                  title={blocked ? `Complete all checklist items first (${incompleteItems} remaining)` : undefined}
                  className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                    pitstop.status === s
                      ? "bg-stone-900 text-white"
                      : blocked
                      ? "text-stone-300 cursor-not-allowed"
                      : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {s === "InProgress" ? "In Progress" : s}
                </button>
              );
            })}
            {hasChecklist && incompleteItems > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-500 ml-1" title={`${incompleteItems} checklist item${incompleteItems > 1 ? "s" : ""} remaining`}>
                <AlertTriangle className="w-3 h-3" />
                {checkedCount}/{items.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={pitstop.priority}
              onChange={async (e) => {
                const priority = e.target.value as PitstopPriority;
                onUpdated({ ...pitstop, priority });
                await fetch(`/api/pitstops/${pitstop.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ priority }),
                });
              }}
              className={`text-[10px] font-medium rounded border px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-sky-400 ${
                pitstop.priority === "High"   ? "bg-red-50 border-red-200 text-red-600" :
                pitstop.priority === "Low"    ? "bg-stone-50 border-stone-200 text-stone-400" :
                                               "bg-stone-50 border-stone-200 text-stone-500"
              }`}
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <OwnerPicker users={users} value={pitstop.ownerId} onChange={onOwnerChange} />
            <button
              onClick={handleClone}
              disabled={cloning}
              className="p-1 text-stone-300 hover:text-stone-600 transition-colors disabled:opacity-50"
              title="Clone pitstop"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1 text-stone-300 hover:text-red-400 transition-colors"
              title="Delete pitstop"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
