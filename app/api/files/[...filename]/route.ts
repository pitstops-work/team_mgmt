import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// In production (Render), files live on the mounted disk outside public/.
// This route serves them so URLs like /api/files/foo.png work.
// Locally, Next.js serves public/uploads directly — this route is unused.

const UPLOAD_DIR = process.env.UPLOAD_DIR;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string[] }> }
) {
  if (!UPLOAD_DIR) {
    return new Response("Not found", { status: 404 });
  }

  const { filename } = await params;
  const safeName = filename.join("/").replace(/\.\./g, "");
  const filePath = path.join(UPLOAD_DIR, safeName);

  try {
    const buffer = await readFile(filePath);
    // Derive a basic content type from the extension
    const ext = path.extname(safeName).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".txt": "text/plain",
      ".csv": "text/csv",
    };
    const contentType = contentTypeMap[ext] ?? "application/octet-stream";
    return new Response(buffer, { headers: { "Content-Type": contentType } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
