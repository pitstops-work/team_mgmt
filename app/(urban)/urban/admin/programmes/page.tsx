import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireActor, can } from "@/lib/urban/access";
import { parseSettings, setupItemsFor } from "@/lib/urban/settings";
import { STARTER_PROGRAMMES } from "@/lib/urban/starter";
import { Card, Empty, PageTitle } from "../../_ui";
import { LoadStarterButton } from "./ProgrammeButtons";

export const dynamic = "force-dynamic";

export default async function ProgrammesPage() {
  const actor = await requireActor();
  if (!(await can(actor, "programme.edit"))) redirect("/urban");

  const programmes = await prisma.uoProgramme.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { efforts: true } } } });
  const loaded = new Set(programmes.map((p) => p.key));
  const starters = STARTER_PROGRAMMES.filter((s) => !loaded.has(s.key));

  return (
    <div className="space-y-6">
      <PageTitle title="Programmes" sub="Each programme is settings: its setup, its routines, what to read from the partner's MIS, and its need." />

      {programmes.length ? (
        <Card className="divide-y divide-stone-100">
          {programmes.map((p) => {
            const r = parseSettings(p.settings);
            return (
              <Link key={p.id} href={`/urban/admin/programmes/${p.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-stone-50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900">
                    {p.name} {!p.active && <span className="ml-1 text-xs font-normal text-stone-400">inactive</span>}
                  </p>
                  {r.ok ? (
                    <p className="mt-0.5 text-xs text-stone-500">
                      {r.settings.place_level} level · {setupItemsFor(r.settings, "new").length} setup items (new) · {setupItemsFor(r.settings, "already_running").length} (already running) · {r.settings.routines.length} routine{r.settings.routines.length === 1 ? "" : "s"}
                      {r.settings.partner_mis ? ` · ${r.settings.partner_mis}` : ""}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-red-600">Settings invalid: {r.errors[0]}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-stone-400">v{p.version} · {p._count.efforts} effort{p._count.efforts === 1 ? "" : "s"}</span>
              </Link>
            );
          })}
        </Card>
      ) : (
        <Empty>No programmes yet. Load the starters below.</Empty>
      )}

      {starters.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-800">Starter programmes</h2>
          <p className="mb-2 text-xs text-stone-500">Written from the current goal templates (spec §5–6). Loading copies them in; after that you edit them here.</p>
          <Card className="divide-y divide-stone-100">
            {starters.map((s) => (
              <div key={s.key} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-800">{s.name}</p>
                  <p className="truncate text-xs text-stone-500">{s.settings.description}</p>
                </div>
                <LoadStarterButton programmeKey={s.key} />
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
