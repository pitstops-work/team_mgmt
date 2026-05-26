"use client";

import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import ChecklistCompletionList from "@/components/ChecklistCompletionList";

interface Props {
  pitstop: {
    id: string;
    title: string;
    goal: { id: string; title: string };
  };
  onClose: () => void;
  onChanged: () => void;
}

export default function PitstopQuickSheet({ pitstop, onClose, onChanged }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md sm:mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-stone-900 truncate">{pitstop.title}</h2>
            <p className="text-xs text-stone-500 truncate">{pitstop.goal.title}</p>
          </div>
          <Link
            href={`/goals/${pitstop.goal.id}/pitstops/${pitstop.id}`}
            className="text-xs text-sky-600 hover:underline flex items-center gap-0.5 flex-shrink-0 mt-0.5"
          >
            Open <ArrowRight className="w-3 h-3" />
          </Link>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ChecklistCompletionList pitstopId={pitstop.id} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}
