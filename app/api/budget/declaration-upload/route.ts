import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Signed & sealed Finance Declaration scan. Stored PRIVATE — it is a legal
// document carrying signatures and an organisation seal.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const allowed = ["application/pdf", "image/jpeg", "image/png", "application/octet-stream"];
  if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF and images are allowed" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 413 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(`declarations/${Date.now()}-${safeName}`, file, {
    access: "private",
    addRandomSuffix: true,
  });
  return NextResponse.json({ url: blob.url });
}
