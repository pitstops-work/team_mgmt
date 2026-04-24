import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const pitstopId = formData.get("pitstopId") as string | null;
  const goalId = formData.get("goalId") as string | null;

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  // Sanitise filename for use as Blob pathname
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  let url: string;
  try {
    // Convert to Buffer first — avoids stream-consumption issues in some runtimes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const blob = await put(safeName, buffer, {
      access: "private",
      contentType: file.type || "application/octet-stream",
    });
    url = blob.url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Blob upload failed:", msg);
    return Response.json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }

  const attachment = await prisma.attachment.create({
    data: {
      name: file.name,
      type: "File",
      url,
      size: file.size,
      mimeType: file.type,
      pitstopId: pitstopId ?? undefined,
      goalId: goalId ?? undefined,
    },
  });

  return Response.json(attachment, { status: 201 });
}
