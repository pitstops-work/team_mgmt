import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { key, label, baseUrl, authType, credentials, isActive, notes } = await req.json();
  if (!key || !label || !baseUrl) {
    return Response.json({ error: "key, label, baseUrl required" }, { status: 400 });
  }

  // Only overwrite credentials if a fresh object is provided; null/undefined keeps existing.
  if (credentials && typeof credentials === "object") {
    await prisma.$executeRaw`
      UPDATE "MISProviderConfig"
      SET key = ${key}, label = ${label}, "baseUrl" = ${baseUrl},
          "authType" = ${authType ?? "frappe"},
          credentials = ${JSON.stringify(credentials)}::jsonb,
          "isActive" = ${isActive !== false},
          notes = ${notes ?? null},
          "updatedAt" = NOW()
      WHERE id = ${id}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "MISProviderConfig"
      SET key = ${key}, label = ${label}, "baseUrl" = ${baseUrl},
          "authType" = ${authType ?? "frappe"},
          "isActive" = ${isActive !== false},
          notes = ${notes ?? null},
          "updatedAt" = NOW()
      WHERE id = ${id}
    `;
  }

  return Response.json({ id, key, label, baseUrl });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.$executeRaw`DELETE FROM "MISProviderConfig" WHERE id = ${id}`;
  return Response.json({ ok: true });
}
