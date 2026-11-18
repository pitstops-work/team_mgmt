// One readable line per history event. Pure; used by server pages.
type Ev = { actor: string; action: string; entity: string; reason: string | null; after: unknown };

export function eventLine(ev: Ev): string {
  const a = (ev.after ?? {}) as Record<string, unknown>;
  const title = typeof a.title === "string" ? ` “${a.title}”` : "";
  const stepped = a.steppedIn ? " (stepped in)" : "";
  const why = ev.reason ? ` — ${ev.reason}` : "";
  const who = ev.actor;
  switch (`${ev.entity}:${ev.action}`) {
    case "effort:created": return `${who} created the effort`;
    case "task:completed": return `${who} completed${title}${stepped}`;
    case "task:reopened": return `${who} reopened an item${stepped}${why}`;
    case "task:skipped": return `${who} skipped an item${stepped}${why}`;
    case "task:rescheduled": return `${who} moved an item to ${String(a.due ?? "")}${stepped}${why}`;
    case "task:followup_raised": return `${a.auto ? "Follow-up raised automatically" : `${who} raised a follow-up`}${title}${a.who === "partner" ? " (partner)" : ""}`;
    case "task:added_by_programme": return "A setup item was added by a programme change";
    case "task:updated_by_programme": return "A setup item changed with the programme";
    case "session:started": return `${who} started ${String(a.routine ?? "a session")} (${String(a.period ?? "")})${stepped}`;
    case "session:arrived": return `${who} reached the site`;
    case "session:closed": return `${who} closed the session${stepped}`;
    case "session:closed_early": return `${who} closed the session early — ${String(a.carried ?? 0)} item(s) carried to follow-ups${why}`;
    case "evidence:added": return `${who} added a file`;
    default: return `${who} ${ev.action.replace(/_/g, " ")} (${ev.entity})${why}`;
  }
}
