import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireActor, can, assignableOwnerIds } from "@/lib/urban/access";
import { placePaths } from "@/lib/urban/places";
import { parseSettings, setupItemsFor } from "@/lib/urban/settings";
import { todayIST } from "@/lib/urban/time";
import { PageTitle } from "../../_ui";
import { NewEffortForm, type ProgrammeOption, type PlaceOption } from "./NewEffortForm";

export const dynamic = "force-dynamic";

export default async function NewEffortPage() {
  const actor = await requireActor();
  if (!(await can(actor, "effort.create"))) redirect("/urban");

  const programmes = await prisma.uoProgramme.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const options: ProgrammeOption[] = programmes.flatMap((p) => {
    const r = parseSettings(p.settings);
    if (!r.ok) return [];
    return [{
      id: p.id, name: p.name, level: r.settings.place_level, partnerOptional: r.settings.partner_optional,
      setupNew: setupItemsFor(r.settings, "new").length, setupRunning: setupItemsFor(r.settings, "already_running").length,
      routines: r.settings.routines.map((x) => `${x.name} (${x.cadence})`),
    }];
  });

  const levels = [...new Set(options.map((o) => o.level))];
  const places = await prisma.uoPlace.findMany({ where: { active: true, level: { in: levels } }, select: { id: true, level: true, name: true } });
  const paths = await placePaths(places.map((p) => p.id));
  const placeOptions: PlaceOption[] = places
    .map((p) => ({ id: p.id, level: p.level, name: p.name, path: paths.get(p.id) ?? p.name }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const allowed = await assignableOwnerIds(actor);
  const owners = await prisma.user.findMany({
    where: allowed === "any" ? { role: { in: ["member", "admin", "super-admin"] } } : { id: { in: allowed } },
    select: { id: true, name: true, email: true, designation: true },
    orderBy: { name: "asc" },
  });
  const partners = await prisma.uoPartner.findMany({ where: { active: true }, select: { id: true, name: true, mis: true }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl">
      <PageTitle title="New effort" sub="A programme, in a place, with a partner, owned by an RP." />
      <NewEffortForm
        programmes={options}
        places={placeOptions}
        partners={partners}
        owners={owners.map((o) => ({ id: o.id, label: `${o.name ?? o.email}${o.designation && o.designation !== "Other" ? ` · ${o.designation}` : ""}` }))}
        defaultOwnerId={actor.id}
        today={todayIST()}
        canAddSite={actor.role === "admin"}
      />
    </div>
  );
}
