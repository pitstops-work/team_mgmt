import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireActor, can } from "@/lib/urban/access";
import { loadProgrammeNumbers, pct } from "@/lib/urban/numbers";
import { Card, Empty, PageTitle } from "../_ui";

export const dynamic = "force-dynamic";

// Programme screen index: one line per active programme with its headline number.
export default async function NumbersIndex() {
  const actor = await requireActor();
  if (!(await can(actor, "programme.view"))) redirect("/urban");
  const programmes = await prisma.uoProgramme.findMany({ where: { active: true }, select: { key: true, name: true }, orderBy: { name: "asc" } });
  const all = await Promise.all(programmes.map((p) => loadProgrammeNumbers(actor, p.key, null)));

  return (
    <div>
      <PageTitle title="Numbers" sub="Need vs delivered, per programme, by city → zone → cluster → settlement." />
      {programmes.length === 0 ? <Empty>No active programmes.</Empty> : (
        <Card className="divide-y divide-stone-100">
          {all.map((d, i) => {
            if (!d) return <div key={programmes[i].key} className="px-4 py-3 text-sm text-stone-500">{programmes[i].name} — settings invalid</div>;
            const t = d.total;
            const kind = d.programme.settings.need?.type;
            const sat = t.saturation?._all;
            const headline = kind === "count" && t.need
              ? `Need ${t.need.need} · running ${t.efforts.running} · remaining ${t.need.remaining}`
              : kind === "saturation"
                ? `${sat ? `${pct(sat.received, sat.eligible) ?? "—"}% saturated` : "No figures yet"}${t.coverage ? ` · ${t.coverage.covered}/${t.coverage.total} ${d.programme.settings.place_level}s covered` : ""}`
                : `${t.efforts.running} running · ${t.efforts.settingUp} setting up`;
            return (
              <Link key={d.programme.key} href={`/urban/numbers/${d.programme.key}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
                <span className="text-sm font-medium text-stone-800">{d.programme.name}</span>
                <span className="text-right text-xs text-stone-500">{headline}</span>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
