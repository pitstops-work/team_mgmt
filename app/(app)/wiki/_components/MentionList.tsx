"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

type Item = { id: string; slug: string; label: string };

export type MentionListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

export const MentionList = forwardRef<MentionListRef, {
  items: Item[];
  command: (props: { id: string; label: string }) => void;
}>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((s) => (s - 1 + items.length) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selected];
        if (item) command({ id: item.id, label: item.label });
        return true;
      }
      return false;
    },
  }), [items, selected, command]);

  if (items.length === 0) {
    return <div className="rounded-md border border-stone-200 bg-white p-2 text-xs text-stone-400 shadow-md">No matches</div>;
  }

  return (
    <div className="max-h-64 w-72 overflow-y-auto rounded-md border border-stone-200 bg-white py-1 shadow-md">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onClick={() => command({ id: item.id, label: item.label })}
          className={`flex w-full flex-col items-start gap-0.5 px-2.5 py-1.5 text-left text-xs ${i === selected ? "bg-amber-100" : "hover:bg-stone-50"}`}
        >
          <span className="font-medium text-stone-900">{item.label}</span>
          <span className="text-[10px] text-stone-500">{item.slug}</span>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = "MentionList";
