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

  let url: string;
  try {
    const blob = await put(file.name, file, { access: "public" });
    url = blob.url;
  } catch (e) {
    console.error("Blob upload failed:", e);
    return Response.json({ error: "File upload failed. Please try again." }, { status: 500 });
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
