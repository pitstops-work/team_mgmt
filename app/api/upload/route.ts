import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// On Render: UPLOAD_DIR points to the mounted disk, files are served via /api/files/
// Locally: files go to public/uploads and are served by Next.js static file serving
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
const UPLOAD_URL_PREFIX = process.env.UPLOAD_DIR ? "/api/files" : "/uploads";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const pitstopId = formData.get("pitstopId") as string | null;
  const goalId = formData.get("goalId") as string | null;

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  await mkdir(UPLOAD_DIR, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(UPLOAD_DIR, safeName);
  await writeFile(filePath, buffer);

  const attachment = await prisma.attachment.create({
    data: {
      name: file.name,
      type: "File",
      url: `${UPLOAD_URL_PREFIX}/${safeName}`,
      size: file.size,
      mimeType: file.type,
      pitstopId: pitstopId ?? undefined,
      goalId: goalId ?? undefined,
    },
  });

  return Response.json(attachment, { status: 201 });
}
