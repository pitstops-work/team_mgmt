"use client";

import { useState } from "react";
import { Users, ChevronDown, ChevronRight, X } from "lucide-react";
import Avatar from "@/components/Avatar";

type User = { id: string; name: string | null; image: string | null };
type CoOwner = { userId: string; user: User };

export default function CoOwnersSection({
  pitstopId,
  users,
}: {
  pitstopId: string;
  users: User[];
}) {
  const [coOwners, setCoOwners] = useState<CoOwner[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (!open && coOwners === null) {
      setLoading(true);
      const res = await fetch(`/api/pitstops/${pitstopId}/co-owners`);
      if (res.ok) setCoOwners(await res.json());
      else setCoOwners([]);
      setLoading(false);
    }
    setOpen((v) => !v);
  };

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    const res = await fetch(`/api/pitstops/${pitstopId}/co-owners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
    });
    if (res.ok) {
      const data = await res.json();
      const user = users.find((u) => u.id === selectedUserId)!;
      setCoOwners((prev) => [...(prev ?? []), { userId: selectedUserId, user }]);
      setSelectedUserId("");
    }
    setSaving(false);
  };

  const handleRemove = async (userId: string) => {
    setCoOwners((prev) => (prev ?? []).filter((c) => c.userId !== userId));
    await fetch(`/api/pitstops/${pitstopId}/co-owners`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
  };

  const existingIds = new Set(coOwners?.map((c) => c.userId) ?? []);
  const available = users.filter((u) => !existingIds.has(u.id));

  return (
    <div className="px-4 py-3 border-b border-stone-100">
      <button onClick={toggle} className="flex items-center justify-between w-full text-left">
        <span className="text-xs font-medium text-stone-500 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Co-owners
          {coOwners && coOwners.length > 0 && (
            <span className="text-stone-300">({coOwners.length})</span>
          )}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {loading && <p className="text-xs text-stone-400">Loading…</p>}

          {coOwners && coOwners.length > 0 && (
            <div className="space-y-1">
              {coOwners.map((c) => (
                <div key={c.userId} className="flex items-center gap-2 group">
                  <Avatar user={c.user} size={16} />
                  <span className="flex-1 text-xs text-stone-700">{c.user.name}</span>
                  <button
                    onClick={() => handleRemove(c.userId)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-red-400 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {available.length > 0 && (
            <div className="flex gap-1">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 bg-white"
              >
                <option value="">Add co-owner…</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                disabled={!selectedUserId || saving}
                className="px-2 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-md transition-colors"
              >
                Add
              </button>
            </div>
          )}

          {coOwners && coOwners.length === 0 && available.length === 0 && (
            <p className="text-xs text-stone-400">No users available.</p>
          )}
        </div>
      )}
    </div>
  );
}
