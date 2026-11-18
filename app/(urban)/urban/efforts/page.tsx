import Link from "next/link";
import { requireActor, can } from "@/lib/urban/access";
import { listEfforts, type EffortRow } from "@/lib/urban/queries";
import { formatDay, relativeDue, todayIST } from "@/lib/urban/time";
import prisma from "@/lib/prisma";
import { Card, Empty, PageTitle, PhaseChip } from "../_ui";

export const dynamic = "force-dynamic";

export default async function EffortsPage() {
  const actor = await requireActor();
  const [efforts, canCreate, programmeCount] = await Promise.all([
    listEfforts(actor),
    can(actor, "effort.create"),
    prisma.uoProgramme.count({ where: { active: true } }),
  ]);
  const today = todayIST();

  // Group by programme, keeping the list's order (open first, newest first).
  const groups = new Map<string, { name: string; rows: EffortRow[] }>();
  for (const e of efforts) {
    const g = groups.get(e.programme.key) ?? { name: e.programme.name, rows: [] };
    g.rows.push(e);
    groups.set(e.programme.key, g);
  }

  return (
    <div>
      <PageTitle
        title="Efforts"
        sub={efforts.length ? `${efforts.length} effort${efforts.length === 1 ? "" : "s"} you can see` : undefined}
        action={canCreate && programmeCount > 0 ? (
          <Link href="/urban/efforts/new" className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700">New effort</Link>
        ) : undefined}
      />

      {programmeCount === 0 ? (
        <Empty>
          No programmes yet.{" "}
          {actor.role === "admin" ? <Link href="/urban/admin/programmes" className="font-medium text-stone-800 underline">Load the starter programmes</Link> : "An admin needs to set them up."}
        </Empty>
      ) : efforts.length === 0 ? (
        <Empty>No efforts yet.{canCreate && " Start one with New effort."}</Empty>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([key, g]) => (
            <section key={key}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">{g.name} · {g.rows.length}</h2>
              <Card className="divide-y divide-stone-100">
                {g.rows.map((e) => (
                  <Link key={e.id} href={`/urban/efforts/${e.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-stone-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-stone-900">{e.title}</span>
                        <PhaseChip phase={e.status.phase} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-stone-500">
                        {e.placePath}{e.partner ? ` · ${e.partner}` : ""} · {e.owner}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      {e.status.phase === "setting_up" && (
                        <p className="text-stone-600">{e.status.setupClosed}/{e.status.setupTotal} setup</p>
                      )}
                      {e.status.overdue > 0 && <p className="font-medium text-red-600">{e.status.overdue} overdue</p>}
                      {e.status.overdue === 0 && e.status.nextDue && <p className="text-stone-400">next {formatDay(e.status.nextDue, today)} · {relativeDue(e.status.nextDue, today)}</p>}
                    </div>
                  </Link>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
