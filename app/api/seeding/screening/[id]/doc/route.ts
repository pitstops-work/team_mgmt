/** GET /api/seeding/screening/[id]/doc?i=<n> — one of an application's documents, for someone allowed to see it. */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import { canSee, getScreeningAccess } from "@/lib/seeding/screening/access";
import { fetchDoc, type Doc } from "@/lib/seeding/screening/draft";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const s = session ? await getScreeningAccess(await getSeedingAccess(session)) : null;
  const { id } = await params;
  const app = s ? await prisma.screeningApplication.findUnique({ where: { id } }) : null;
  if (!s || !app || !canSee(s, app)) return new Response("Not found", { status: 404 });
  const doc = ((app.documents ?? []) as Doc[])[Number(req.nextUrl.searchParams.get("i"))];
  if (!doc) return new Response("Not found", { status: 404 });
  const buf = await fetchDoc(doc.url);
  const ext = (doc.url.split("?")[0].split(".").pop() || "").toLowerCase();
  await prisma.screeningEvent.create({ data: { applicationId: id, actorId: s.userId, type: "document_viewed", detail: { kind: doc.kind } } });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.name.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
