import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getDownloadUrl } from "@vercel/blob";

// GET /api/audio?url=<blob-url>
// Redirects to a short-lived signed download URL for a private Vercel Blob audio file.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const blobUrl = req.nextUrl.searchParams.get("url");
  if (!blobUrl) return new Response("Missing url", { status: 400 });

  const downloadUrl = getDownloadUrl(blobUrl);
  return Response.redirect(downloadUrl, 302);
}
