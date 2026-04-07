"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Pencil, Trash2, Paperclip, MessageSquare, Upload, Bell, BellOff, ChevronUp, ChevronDown, ArrowRight, Flag, Calendar, RefreshCw, Lock } from "lucide-react";
import Avatar from "@/components/Avatar";
import { GoalStatusBadge, PitstopStatusBadge } from "@/components/StatusBadge";
import PitstopTypeBadge from "@/components/PitstopTypeBadge";
import CreatePitstopModal from "./CreatePitstopModal";
import EditGoalModal from "./EditGoalModal";
import { getTimelineInfo, timelineChip, timelineNodeBorder, fmtDate } from "@/lib/timeline";
import OwnerPicker from "@/components/OwnerPicker";

type Attachment = { id: string; name: string; url: string; type: string };
type Thread = { id: string; name: string; _count: { messages: number } };
type User = { id: string; name: string | null; image: string | null };
type Pitstop = {
  id: string;
  title: string;
  type: string;
  notes: string | null;
  status: "Upcoming" | "InProgress" | "Done";
  order: number;
  ownerId?: string | null;
  owner?: User | null;
  startDate?: string | null;
  targetDate?: string | null;
  completedAt?: string | null;
  attachments: Attachment[];
  threads: Thread[];
};
type Recurrence = "None" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";
type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: "Active" | "Paused" | "Complete";
  recurrence: Recurrence;
  targetDate?: string | null;
  owner: User;
  attachments: Attachment[];
  pitstops: Pitstop[];
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
  const [goal, setGoal] = useState(initialGoal);
  const [showCreatePitstop, setShowCreatePitstop] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [deletingGoal, setDeletingGoal] = useState(false);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [recurLoading, setRecurLoading] = useState(false);
  const isOwner = goal.owner.id === currentUserId;
  const sortedPitstops = [...goal.pitstops].sort((a, b) => a.order - b.order);

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
      setGoal((g) => ({ ...g, attachments: [...g.attachments, att] }));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGoalOwnerChange = async (ownerId: string) => {
    const newOwner = users.find((u) => u.id === ownerId)!;
    setGoal((g) => ({ ...g, owner: newOwner }));
    await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId }),
    });
  };

  const handlePitstopOwnerChange = async (pitstopId: string, ownerId: string) => {
    const newOwner = users.find((u) => u.id === ownerId)!;
    setGoal((g) => ({
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

    setGoal((g) => ({ ...g, pitstops: withNewOrder }));

    await fetch(`/api/goals/${goal.id}/pitstops/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: withNewOrder.map((p) => p.id) }),
    });
  };

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
            <div className="mt-3">
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
            {isOwner && (
              <>
                <button
                  onClick={() => setShowEditGoal(true)}
                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-md transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDeleteGoal}
                  disabled={deletingGoal}
                  className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
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
          <RouteMap pitstops={sortedPitstops} goalTitle={goal.title} goalId={goal.id} />
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
              goalId={goal.id}
              users={users}
              isFirst={idx === 0}
              isLast={idx === sortedPitstops.length - 1}
              onReorder={handleReorder}
              onOwnerChange={(ownerId) => handlePitstopOwnerChange(pitstop.id, ownerId)}
              onDeleted={(id) => setGoal((g) => ({ ...g, pitstops: g.pitstops.filter((p) => p.id !== id) }))}
              onUpdated={(updated) =>
                setGoal((g) => ({ ...g, pitstops: g.pitstops.map((p) => (p.id === updated.id ? updated as Pitstop : p)) }))
              }
            />
          ))}
        </div>
      )}

      {showCreatePitstop && (
        <CreatePitstopModal
          goalId={goal.id}
          goalTargetDate={goal.targetDate}
          onClose={() => setShowCreatePitstop(false)}
          onCreated={(pitstop) => {
            const p = pitstop as Pitstop;
            const newPitstop = { ...p, order: p.order ?? goal.pitstops.length };
            setGoal((g) => ({ ...g, pitstops: [...g.pitstops, newPitstop] }));
            setShowCreatePitstop(false);
          }}
        />
      )}

      {showEditGoal && (
        <EditGoalModal
          goal={goal}
          onClose={() => setShowEditGoal(false)}
          onUpdated={(updated) => setGoal((g) => ({ ...g, ...updated }))}
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

function RouteMap({ pitstops, goalTitle, goalId }: { pitstops: Pitstop[]; goalTitle: string; goalId: string }) {
  return (
    <div className="overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0">
      <div className="flex items-center gap-0 min-w-max">
        {pitstops.map((pitstop, idx) => {
          const tlInfo = getTimelineInfo(pitstop);
          const tlBorder = timelineNodeBorder(tlInfo);
          const tlChip = timelineChip(tlInfo);
          return (
          <div key={pitstop.id} className="flex items-center">
            <Link
              href={`/goals/${goalId}/pitstops/${pitstop.id}`}
              className={`flex flex-col gap-1 px-3 py-2.5 rounded-xl border-2 text-left w-36 hover:shadow-sm transition-all ${statusColor[pitstop.status]} ${tlBorder}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">#{idx + 1}</span>
              <span className="text-xs font-medium leading-snug line-clamp-2">{pitstop.title}</span>
              <div className="flex items-center gap-1 flex-wrap">
                <PitstopTypeBadge type={pitstop.type as Parameters<typeof PitstopTypeBadge>[0]["type"]} />
                {tlChip && (
                  <span className={`text-[9px] font-medium px-1 py-0.5 rounded border ${tlChip.cls}`}>{tlChip.label}</span>
                )}
              </div>
            </Link>
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
  onOwnerChange,
  onDeleted,
  onUpdated,
}: {
  pitstop: Pitstop;
  goalId: string;
  users: User[];
  isFirst: boolean;
  isLast: boolean;
  onReorder: (id: string, dir: "up" | "down") => void;
  onOwnerChange: (ownerId: string) => void;
  onDeleted: (id: string) => void;
  onUpdated: (p: Pitstop) => void;
}) {
  const totalMessages = pitstop.threads.reduce((sum, t) => sum + t._count.messages, 0);

  const handleDelete = async () => {
    if (!confirm("Delete this pitstop?")) return;
    await fetch(`/api/pitstops/${pitstop.id}`, { method: "DELETE" });
    onDeleted(pitstop.id);
  };

  const handleStatusChange = async (status: string) => {
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
        <Link href={`/goals/${goalId}/pitstops/${pitstop.id}`} className="flex items-start gap-3 px-4 py-3.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-sm font-medium text-stone-900">{pitstop.title}</span>
              <PitstopStatusBadge status={pitstop.status} />
              {(() => {
                const chip = timelineChip(getTimelineInfo(pitstop));
                return chip ? (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${chip.cls}`}>{chip.label}</span>
                ) : null;
              })()}
            </div>
            <PitstopTypeBadge type={pitstop.type as Parameters<typeof PitstopTypeBadge>[0]["type"]} />
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
          <div className="flex gap-1">
            {(["Upcoming", "InProgress", "Done"] as const).map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                  pitstop.status === s
                    ? "bg-stone-900 text-white"
                    : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                }`}
              >
                {s === "InProgress" ? "In Progress" : s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <OwnerPicker users={users} value={pitstop.ownerId} onChange={onOwnerChange} />
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
