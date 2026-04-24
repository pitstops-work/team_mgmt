import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/attachment/:id
// Fetches a private Vercel Blob using the server-side token and streams it to the client
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: { url: true, name: true, mimeType: true },
  });
  if (!attachment) return new Response("Not found", { status: 404 });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new Response("Storage not configured", { status: 500 });

  const blobRes = await fetch(attachment.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!blobRes.ok) return new Response("File not found", { status: 404 });

  const contentType = attachment.mimeType ?? blobRes.headers.get("content-type") ?? "application/octet-stream";
  const safeName = encodeURIComponent(attachment.name ?? "file");

  return new Response(blobRes.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
