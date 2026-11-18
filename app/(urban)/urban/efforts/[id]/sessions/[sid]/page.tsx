import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/urban/access";
import { loadSession } from "@/lib/urban/queries";
import { todayIST } from "@/lib/urban/time";
import { Card } from "../../../../_ui";
import { TaskList } from "../../../../_work/TaskList";
import { SessionControls } from "../../../../_work/SessionControls";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const actor = await requireActor();
  const { id, sid } = await params;
  const s = await loadSession(actor, id, sid);
  if (!s) notFound();
  const today = todayIST();
  const open = s.tasks.filter((t) => t.status === "open");
  const requiredOpen = open.filter((t) => t.required).length;
  const closed = !!s.closedAt;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/urban/efforts/${s.effort.id}`} className="text-xs text-stone-400 hover:text-stone-700">← {s.effort.title}</Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-stone-900">{s.routine.name} <span className="text-base font-normal text-stone-400">· {s.period}</span></h1>
        <p className="mt-0.5 text-sm text-stone-500">{s.effort.programme} · {s.effort.placePath}{s.effort.partner ? ` · ${s.effort.partner}` : ""}</p>
        <p className="mt-0.5 text-xs text-stone-400">
          {s.tasks.length - open.length} of {s.tasks.length} done
          {closed ? ` · closed ${new Date(s.closedAt!).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}` : ""}
          {s.closedNote ? ` — “${s.closedNote}”` : ""}
        </p>
      </div>

      <SessionControls sessionId={s.id} effortId={s.effort.id} mode={s.routine.mode} arrivedAt={s.arrivedAt} closed={closed} requiredOpen={requiredOpen} canWork={s.canWork} />

      <Card>
        <TaskList tasks={s.tasks} check={s.check} canWork={s.canWork && !closed && (s.routine.mode !== "visit" || !!s.arrivedAt)} today={today} effortId={s.effort.id} />
      </Card>
      {!closed && s.routine.mode === "visit" && !s.arrivedAt && s.canWork && <p className="text-xs text-stone-500">Tap “I&apos;ve reached” when you get there to start recording.</p>}
    </div>
  );
}
