import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";

export async function GET() {
  const partners = await prisma.mapPartner.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(partners);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const veto = adminForbidden(session); if (veto) return veto;

  const body = await request.json();
  const { key, label, color, contactName, contactPhone, notes, isBuiltIn } = body;

  if (!key?.trim() || !label?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const partner = await prisma.mapPartner.create({
    data: {
      key: String(key).trim(),
      label: String(label).trim(),
      color: String(color ?? "#6366f1").trim(),
      contactName: contactName ? String(contactName).trim() : null,
      contactPhone: contactPhone ? String(contactPhone).trim() : null,
      notes: notes ? String(notes).trim() : null,
      isBuiltIn: Boolean(isBuiltIn ?? false),
    },
  });

  return NextResponse.json(partner, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const veto = adminForbidden(session); if (veto) return veto;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await request.json();
  const { contactName, contactPhone, notes, color } = body;

  const partner = await prisma.mapPartner.update({
    where: { id },
    data: {
      color: color !== undefined ? String(color).trim() : undefined,
      contactName: contactName !== undefined ? (contactName ? String(contactName).trim() : null) : undefined,
      contactPhone: contactPhone !== undefined ? (contactPhone ? String(contactPhone).trim() : null) : undefined,
      notes: notes !== undefined ? (notes ? String(notes).trim() : null) : undefined,
    },
  });

  return NextResponse.json(partner);
}
