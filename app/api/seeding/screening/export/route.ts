/** GET — the applications this person can see, with status and scores, as CSV. */

import * as XLSX from "xlsx";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import { getScreeningAccess, visibleWhere } from "@/lib/seeding/screening/access";
import { STATUS_META } from "@/lib/seeding/screening/decide";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  const s = session ? await getScreeningAccess(await getSeedingAccess(session)) : null;
  if (!s) return new Response("Not found", { status: 404 });
  const apps = await prisma.screeningApplication.findMany({
    where: visibleWhere(s),
    orderBy: { createdAt: "asc" },
    include: { geo: true, reviews: { orderBy: { createdAt: "asc" }, include: { reviewer: { select: { name: true } } } } },
  });
  const rows = apps.map((a) => {
    const l2 = a.reviews.filter((r) => r.level === "l2");
    const l3 = a.reviews.filter((r) => r.level === "l3").at(-1);
    return {
      Reference: a.ref,
      Name: a.name,
      Email: a.email,
      Geography: a.geo?.label ?? "",
      District: a.district ?? "",
      Theme: a.theme ?? "",
      Group: a.isGroup ? "yes" : "no",
      Status: STATUS_META[a.status].label,
      Flags: a.flags.join("; "),
      "Below criteria": (a.criteriaFlags as { criterion: string }[]).map((c) => c.criterion).join("; "),
      "L2 read 1": l2[0]?.total ?? "",
      "L2 read 1 by": l2[0]?.reviewer?.name ?? "",
      "L2 read 2": l2[1]?.total ?? "",
      "L2 read 2 by": l2[1]?.reviewer?.name ?? "",
      "Lead decision": l3?.decision ?? "",
      "Lead justification": l3?.justification ?? "",
      Received: a.createdAt.toISOString().slice(0, 10),
    };
  });
  await prisma.screeningEvent.create({ data: { actorId: s.userId, type: "exported", detail: { rows: rows.length } } });
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="screening-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
