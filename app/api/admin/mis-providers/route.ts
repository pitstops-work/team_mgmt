import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { randomUUID } from "crypto";

type ProviderRow = {
  id: string;
  key: string;
  label: string;
  baseUrl: string;
  authType: string;
  hasCredentials: boolean;
  isActive: boolean;
  lastSyncedAt: Date | null;
  lastSyncStatus: string | null;
  notes: string | null;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = isAdminUser(session);
  // Non-admins still get the list but with credentials hidden (for indicator dropdowns).
  if (!admin && !session.user.id) return Response.json([], { status: 200 });

  const rows = await prisma.$queryRaw<ProviderRow[]>`
    SELECT id, key, label, "baseUrl", "authType",
           (credentials IS NOT NULL) AS "hasCredentials",
           "isActive", "lastSyncedAt", "lastSyncStatus", notes
    FROM "MISProviderConfig"
    ORDER BY label ASC
  `;
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { key, label, baseUrl, authType, credentials, notes } = await req.json();
  if (!key || !label || !baseUrl) {
    return Response.json({ error: "key, label, baseUrl required" }, { status: 400 });
  }

  const id = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "MISProviderConfig" (
        id, key, label, "baseUrl", "authType", credentials, "isActive", notes,
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${key}, ${label}, ${baseUrl}, ${authType ?? "frappe"},
        ${credentials ? JSON.stringify(credentials) : null}::jsonb,
        true, ${notes ?? null}, NOW(), NOW()
      )
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return Response.json({ error: "Provider key already exists" }, { status: 409 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
  return Response.json({ id, key, label, baseUrl }, { status: 201 });
}
