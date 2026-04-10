"use client";

import { useState } from "react";
import { Users, Plus, X } from "lucide-react";
import Avatar from "@/components/Avatar";

type User = { id: string; name: string | null; image: string | null };
type CoOwner = { userId: string; user: User };

export default function GoalCoOwnersSection({
  goalId,
  coOwners: initialCoOwners,
  users,
  currentOwnerId,
}: {
  goalId: string;
  coOwners: CoOwner[];
  users: User[];
  currentOwnerId: string;
}) {
  const [coOwners, setCoOwners] = useState<CoOwner[]>(initialCoOwners);
  const [adding, setAdding] = useState(false);

  const eligible = users.filter(
    (u) => u.id !== currentOwnerId && !coOwners.some((c) => c.userId === u.id)
  );

  const handleAdd = async (userId: string) => {
    const res = await fetch(`/api/goals/${goalId}/co-owners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = await res.json();
      setCoOwners((prev) => [...prev, { userId: data.userId, user: data.user }]);
    }
    setAdding(false);
  };

  const handleRemove = async (userId: string) => {
    const res = await fetch(`/api/goals/${goalId}/co-owners`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) setCoOwners((prev) => prev.filter((c) => c.userId !== userId));
  };

  return (
    <div className="pt-4 border-t border-stone-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-stone-500 flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          Co-owners
        </span>
        {eligible.length > 0 && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        )}
      </div>

      {coOwners.length === 0 && !adding && (
        <p className="text-xs text-stone-400">No co-owners assigned.</p>
      )}

      {coOwners.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {coOwners.map((c) => (
            <div key={c.userId} className="flex items-center gap-1.5 px-2 py-1 bg-stone-50 border border-stone-200 rounded-full group">
              <Avatar name={c.user.name} image={c.user.image} size="xs" />
              <span className="text-xs text-stone-700">{c.user.name ?? "Unknown"}</span>
              <button
                onClick={() => handleRemove(c.userId)}
                className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && eligible.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto border border-stone-200 rounded-lg bg-white shadow-sm">
          {eligible.map((u) => (
            <button
              key={u.id}
              onClick={() => handleAdd(u.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
            >
              <Avatar name={u.name} image={u.image} size="xs" />
              {u.name ?? u.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
