type GoalStatus = "Active" | "Paused" | "Complete";
type PitstopStatus = "Upcoming" | "InProgress" | "Done";

const goalColors: Record<GoalStatus, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Paused: "bg-amber-50 text-amber-700 ring-amber-200",
  Complete: "bg-stone-100 text-stone-500 ring-stone-200",
};

const pitstopColors: Record<PitstopStatus, string> = {
  Upcoming: "bg-sky-50 text-sky-700 ring-sky-200",
  InProgress: "bg-violet-50 text-violet-700 ring-violet-200",
  Done: "bg-stone-100 text-stone-500 ring-stone-200",
};

const pitstopLabels: Record<PitstopStatus, string> = {
  Upcoming: "Upcoming",
  InProgress: "In Progress",
  Done: "Done",
};

export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${goalColors[status]}`}>
      {status}
    </span>
  );
}

export function PitstopStatusBadge({ status }: { status: PitstopStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${pitstopColors[status]}`}>
      {pitstopLabels[status]}
    </span>
  );
}
