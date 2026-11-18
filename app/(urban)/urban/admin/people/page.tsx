import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireActor, can, ROLE_LABEL, urbanRoleOf } from "@/lib/urban/access";
import { placePaths } from "@/lib/urban/places";
import { PageTitle } from "../../_ui";
import { AssignmentsPanel, PlacesPanel, PartnersPanel } from "./PeopleClient";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "people", label: "People" },
  { key: "places", label: "Places" },
  { key: "partners", label: "Partners" },
] as const;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActor();
  if (!(await can(actor, "setup.edit"))) redirect("/urban");
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab! : "people";

  const places = await prisma.uoPlace.findMany({ where: { active: true }, select: { id: true, level: true, name: true, legacyId: true } });
  const paths = await placePaths(places.map((p) => p.id));
  const placeOptions = places
    .map((p) => ({ id: p.id, level: p.level, name: p.name, path: paths.get(p.id) ?? p.name, imported: !!p.legacyId }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return (
    <div>
      <PageTitle title="People & places" sub="Who covers what, the place tree, and the partners doing the work." />
      <nav className="mb-5 flex gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <Link key={t.key} href={`/urban/admin/people?tab=${t.key}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-stone-900 font-medium text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "people" && <People placeOptions={placeOptions} />}
      {tab === "places" && <PlacesPanel places={placeOptions} counts={countByLevel(placeOptions)} />}
      {tab === "partners" && <Partners />}
    </div>
  );
}

function countByLevel(places: { level: string }[]) {
  const c: Record<string, number> = {};
  for (const p of places) c[p.level] = (c[p.level] ?? 0) + 1;
  return c;
}

async function People({ placeOptions }: { placeOptions: { id: string; level: string; path: string }[] }) {
  const users = await prisma.user.findMany({
    where: { role: { in: ["member", "admin", "super-admin", "viewer"] } },
    select: { id: true, name: true, email: true, role: true, designation: true, reportsTo: { select: { name: true, email: true } }, uoAssignments: { select: { id: true, placeId: true, programmeKey: true } } },
    orderBy: [{ designation: "asc" }, { name: "asc" }],
  });
  const programmes = await prisma.uoProgramme.findMany({ select: { key: true, name: true }, orderBy: { name: "asc" } });
  const pathById = new Map(placeOptions.map((p) => [p.id, p.path]));
  const role = urbanRoleOf;
  const order = ["leader", "pm", "zl", "rp", "admin", "other"];
  const rows = users
    .map((u) => ({
      id: u.id, name: u.name ?? u.email, email: u.email, role: ROLE_LABEL[role(u.role, u.designation)], roleKey: role(u.role, u.designation),
      readOnly: u.role === "viewer", reportsTo: u.reportsTo ? u.reportsTo.name ?? u.reportsTo.email : null,
      assignments: u.uoAssignments.map((a) => ({ id: a.id, place: pathById.get(a.placeId) ?? "(inactive place)", programme: programmes.find((p) => p.key === a.programmeKey)?.name ?? (a.programmeKey ? a.programmeKey : "All programmes") })),
    }))
    .sort((a, b) => order.indexOf(a.roleKey) - order.indexOf(b.roleKey) || a.name.localeCompare(b.name));

  return <AssignmentsPanel people={rows} places={placeOptions} programmes={programmes} />;
}

async function Partners() {
  const partners = await prisma.uoPartner.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { efforts: true } } } });
  return <PartnersPanel partners={partners.map((p) => ({ id: p.id, name: p.name, mis: p.mis ?? "", active: p.active, imported: !!p.legacyOrgId, efforts: p._count.efforts }))} />;
}
