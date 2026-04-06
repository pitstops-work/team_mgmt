"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, UserCircle } from "lucide-react";
import Avatar from "./Avatar";

type User = { id: string; name: string | null; image: string | null; email?: string | null };

interface Props {
  users: User[];
  value: string | null | undefined;
  onChange: (userId: string) => void;
}

export default function OwnerPicker({ users, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = users.find((u) => u.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-2 py-1 rounded-md transition-colors"
      >
        {current ? (
          <Avatar name={current.name} image={current.image} size="sm" />
        ) : (
          <UserCircle className="w-4 h-4 text-stone-300" />
        )}
        <span className={current ? "text-stone-700" : "text-stone-400"}>
          {current ? (current.name ?? current.email) : "Unassigned"}
        </span>
        <ChevronDown className="w-3 h-3 text-stone-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-30 min-w-[160px] py-1 max-h-48 overflow-y-auto">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => { onChange(user.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-stone-50 transition-colors text-left ${
                value === user.id ? "text-sky-700 font-medium bg-sky-50" : "text-stone-700"
              }`}
            >
              <Avatar name={user.name} image={user.image} size="sm" />
              <span className="truncate">{user.name ?? user.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
