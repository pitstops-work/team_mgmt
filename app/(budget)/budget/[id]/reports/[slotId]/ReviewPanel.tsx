"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveReport, sendBackReport } from "../../../../budget/report-actions";
import ReportForm from "./ReportForm";

type Slot = { id: string; slotNumber: number; grantYear: number; periodFrom: string; periodTo: string; dueDate: string; status: string; report: any };
type Budget = { id: string; name: string; years: number; lines: any[]; reportConfig: any };

export default function ReviewPanel({
  slot, budget, cumulativePrior,
}: { slot: Slot; budget: Budget; cumulativePrior: Record<string, number> }) {
  const [sendBackNotes, setSendBackNotes] = useState("");
  const [showSendBack, setShowSendBack] = useState(false);
  const [approving, startApprove] = useTransition();
  const [sendingBack, startSendBack] = useTransition();

  function handleApprove() {
    startApprove(async () => {
      await approveReport(slot.id);
    });
  }

  function handleSendBack() {
    if (!sendBackNotes.trim()) return;
    startSendBack(async () => {
      await sendBackReport(slot.id, sendBackNotes.trim());
      setShowSendBack(false);
    });
  }

  return (
    <div className="space-y-6">
      {/* Review action bar */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-amber-800">Reviewing submission</p>
          <p className="text-xs text-amber-600 mt-0.5">Report #{slot.slotNumber} · Grant Year {slot.grantYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/api/budget/${budget.id}/reports/${slot.id}/export`}
            className="border border-stone-200 text-stone-600 hover:bg-stone-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Export (.xlsx)
          </a>
          <button onClick={() => setShowSendBack(s => !s)}
            className="border border-amber-300 text-amber-700 hover:bg-amber-100 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Send back
          </button>
          <button onClick={handleApprove} disabled={approving}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            {approving ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>

      {showSendBack && (
        <div className="bg-white border border-red-200 rounded-xl px-5 py-4 space-y-3">
          <p className="text-sm font-semibold text-stone-700">Send back with notes</p>
          <textarea value={sendBackNotes} onChange={e => setSendBackNotes(e.target.value)}
            rows={3} placeholder="Explain what needs to be corrected…"
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400" />
          <div className="flex gap-3">
            <button onClick={handleSendBack} disabled={sendingBack || !sendBackNotes.trim()}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              {sendingBack ? "Sending…" : "Confirm send back"}
            </button>
            <button onClick={() => setShowSendBack(false)} className="text-sm text-stone-400 hover:text-stone-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Read-only report view */}
      <ReportForm slot={slot} budget={budget} cumulativePrior={cumulativePrior} canEdit={false} isSuperAdmin={true} />
    </div>
  );
}
