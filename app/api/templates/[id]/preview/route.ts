import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getTemplate } from "@/lib/templates";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = getTemplate(id);
  if (!template) return Response.json({ error: "Template not found" }, { status: 404 });

  const { params: templateParams } = await req.json();
  const pitstops = template.build(templateParams ?? {});

  return Response.json(pitstops);
}
