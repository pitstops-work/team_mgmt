"use client";

import { useState } from "react";
import { History, ChevronDown, ChevronRight } from "lucide-react";
import Avatar from "@/components/Avatar";

type AuditEntry = {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtAction(entry: AuditEntry): string {
  if (entry.field === "status") return `Status: ${entry.oldValue} → ${entry.newValue}`;
  if (entry.field === "priority") return `Priority: ${entry.oldValue} → ${entry.newValue}`;
  if (entry.field === "ownerId") return `Owner changed`;
  if (entry.field === "targetDate") return `Target date updated`;
  if (entry.field === "startDate") return `Start date updated`;
  if (entry.action === "created") return `Created`;
  if (entry.action === "deleted") return `Deleted`;
  return entry.action.replace(/_/g, " ");
}

export default function AuditSection({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!open && logs === null) {
      setLoading(true);
      const res = await fetch(`/api/audit?entityType=${entityType}&entityId=${entityId}`);
      if (res.ok) setLogs(await res.json());
      else setLogs([]);
      setLoading(false);
    }
    setOpen((v) => !v);
  };

  return (
    <div className="px-4 py-3 border-b border-stone-100">
      <button onClick={toggle} className="flex items-center justify-between w-full text-left">
        <span className="text-xs font-medium text-stone-500 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          Audit trail
          {logs && logs.length > 0 && (
            <span className="text-stone-300">({logs.length})</span>
          )}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {loading && <p className="text-xs text-stone-400">Loading…</p>}
          {logs && logs.length === 0 && (
            <p className="text-xs text-stone-400">No audit entries yet.</p>
          )}
          {logs && logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 bg-stone-300" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Avatar name={log.user.name} image={log.user.image} size="xs" />
                  <span className="text-xs text-stone-600">{fmtAction(log)}</span>
                </div>
                <span className="text-[10px] text-stone-400">{fmtDate(log.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
