import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireActor, can } from "@/lib/urban/access";
import { ProgrammeEditor } from "./ProgrammeEditor";
import { settingsToJson } from "@/lib/urban/settings";

export const dynamic = "force-dynamic";

export default async function ProgrammeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!(await can(actor, "programme.edit"))) redirect("/urban");
  const { id } = await params;
  const p = await prisma.uoProgramme.findUnique({ where: { id }, include: { _count: { select: { efforts: { where: { closedAt: null } } } } } });
  if (!p) notFound();

  return (
    <div>
      <Link href="/urban/admin/programmes" className="text-xs text-stone-400 hover:text-stone-700">← Programmes</Link>
      <ProgrammeEditor
        id={p.id}
        programmeKey={p.key}
        initialName={p.name}
        initialJson={settingsToJson(p.settings)}
        version={p.version}
        active={p.active}
        openEfforts={p._count.efforts}
      />
    </div>
  );
}
