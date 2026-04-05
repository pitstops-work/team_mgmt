"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, MoreHorizontal, Pencil, Trash2, Paperclip, MessageSquare, Upload, Bell, BellOff } from "lucide-react";
import Avatar from "@/components/Avatar";
import { GoalStatusBadge, PitstopStatusBadge } from "@/components/StatusBadge";
import PitstopTypeBadge from "@/components/PitstopTypeBadge";
import CreatePitstopModal from "./CreatePitstopModal";
import EditGoalModal from "./EditGoalModal";

type Attachment = { id: string; name: string; url: string; type: string };
type Thread = { id: string; name: string; _count: { messages: number } };
type Pitstop = {
  id: string;
  title: string;
  type: string;
  notes: string | null;
  status: "Upcoming" | "InProgress" | "Done";
  attachments: Attachment[];
  threads: Thread[];
};
type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: "Active" | "Paused" | "Complete";
  owner: { id: string; name: string | null; image: string | null };
  attachments: Attachment[];
  pitstops: Pitstop[];
};

export default function GoalDetail({
  goal: initialGoal,
  currentUserId,
  isFollowing: initialIsFollowing,
}: {
  goal: Goal;
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

  const isOwner = goal.owner.id === currentUserId;

  const handleDeleteGoal = async () => {
    if (!confirm("Delete this goal and all its pitstops?")) return;
    setDeletingGoal(true);
    await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    router.push("/dashboard");
  };

  const handleToggleFollow = async () => {
    const method = isFollowing ? "DELETE" : "POST";
    const res = await fetch(`/api/goals/${goal.id}/follow`, { method });
    if (res.ok) setIsFollowing(!isFollowing);
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

  const statusOrder: Record<string, number> = { Upcoming: 0, InProgress: 1, Done: 2 };
  const sortedPitstops = [...goal.pitstops].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
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
            <div className="flex items-center gap-2 mt-3">
              <Avatar name={goal.owner.name} image={goal.owner.image} size="sm" />
              <span className="text-xs text-stone-500">{goal.owner.name}</span>
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

      {/* Pitstops */}
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
          {sortedPitstops.map((pitstop) => (
            <PitstopRow
              key={pitstop.id}
              pitstop={pitstop}
              goalId={goal.id}
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
          onClose={() => setShowCreatePitstop(false)}
          onCreated={(pitstop) => {
            setGoal((g) => ({ ...g, pitstops: [...g.pitstops, pitstop as Pitstop] }));
            setShowCreatePitstop(false);
          }}
        />
      )}

      {showEditGoal && (
        <EditGoalModal
          goal={goal}
          onClose={() => setShowEditGoal(false)}
          onUpdated={(updated) => {
            setGoal((g) => ({ ...g, ...updated }));
            setShowEditGoal(false);
          }}
        />
      )}
    </div>
  );
}

function PitstopRow({
  pitstop,
  goalId,
  onDeleted,
  onUpdated,
}: {
  pitstop: Pitstop;
  goalId: string;
  onDeleted: (id: string) => void;
  onUpdated: (p: Pitstop) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const totalMessages = pitstop.threads.reduce((sum, t) => sum + t._count.messages, 0);

  const handleDelete = async () => {
    if (!confirm("Delete this pitstop?")) return;
    await fetch(`/api/pitstops/${pitstop.id}`, { method: "DELETE" });
    onDeleted(pitstop.id);
  };

  const handleStatusChange = async (status: string) => {
    const res = await fetch(`/api/pitstops/${pitstop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdated(updated);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-lg hover:border-stone-300 transition-all group">
      <Link href={`/goals/${goalId}/pitstops/${pitstop.id}`} className="flex items-start gap-3 px-4 py-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-stone-900">{pitstop.title}</span>
            <PitstopStatusBadge status={pitstop.status} />
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

      <div className="border-t border-stone-100 px-4 py-2 flex items-center justify-between">
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
        <button
          onClick={handleDelete}
          className="p-1 text-stone-300 hover:text-red-400 transition-colors"
          title="Delete pitstop"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
