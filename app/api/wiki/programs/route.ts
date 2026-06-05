import { auth } from "@/lib/auth";
import { getProgrammeBadges } from "@/lib/wiki/articles";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const badges = await getProgrammeBadges();
  return Response.json({ badges });
}
