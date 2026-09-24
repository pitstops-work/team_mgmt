/** Client upload tokens for screening documents (CVs, statements of purpose…) during an import. */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSeedingAccess } from "@/lib/seeding/access";
import { getScreeningAccess } from "@/lib/seeding/screening/access";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        const s = session ? await getScreeningAccess(await getSeedingAccess(session)) : null;
        if (!s || !(s.all || s.canConfigure)) throw new Error("Not allowed");
        if (!pathname.startsWith("seeding/screening/docs/")) throw new Error("Invalid path");
        return {
          allowedContentTypes: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/jpeg",
            "image/png",
          ],
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
