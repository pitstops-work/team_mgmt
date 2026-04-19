import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// GET /api/audio?url=<blob-url>
// Streams a private Vercel Blob audio file to authenticated users.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const blobUrl = req.nextUrl.searchParams.get("url");
  if (!blobUrl) return new Response("Missing url", { status: 400 });

  // Fetch the private blob using the store's read/write token as a Bearer
  const upstream = await fetch(blobUrl, {
    headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });

  if (!upstream.ok) return new Response("Audio not found", { status: 404 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "audio/webm",
      "Content-Length": upstream.headers.get("Content-Length") ?? "",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
