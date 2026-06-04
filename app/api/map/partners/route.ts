/**
 * Partner CRUD — now backed by Org (kind="partner"). Old MapPartner table is
 * preserved during the transition for any caller still reading it directly;
 * this endpoint writes and reads the Org rows.
 *
 * Response shape stays compatible with what /partners + the map UI consumed
 * from MapPartner: { id, key, label, color, contactName, contactPhone,
 * notes, isBuiltIn }. `key` and `label` map to Org.mapKey + Org.name.
 * isBuiltIn is always false now — every partner is an admin-edited row.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";

type PartnerOrgRow = {
  id: string;
  name: string;
  slug: string;
  mapKey: string | null;
  color: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
};

function shapePartner(o: PartnerOrgRow) {
  return {
    id: o.id,
    key: o.mapKey ?? o.slug,
    label: o.name,
    color: o.color ?? "#6366f1",
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    contactEmail: o.contactEmail,
    notes: o.notes,
    isBuiltIn: false,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export async function GET() {
  const rows = await prisma.org.findMany({
    where: { kind: "partner", archivedAt: null },
    select: {
      id: true, name: true, slug: true, mapKey: true, color: true,
      contactName: true, contactPhone: true, contactEmail: true, notes: true,
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows.map(shapePartner));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const veto = adminForbidden(session); if (veto) return veto;

  const body = await request.json();
  const { key, label, color, contactName, contactPhone, contactEmail, notes } = body;

  if (!label?.trim()) {
    return NextResponse.json({ error: "Missing required fields (label)" }, { status: 400 });
  }
  const name = String(label).trim();
  const mapKeyRaw = key ? String(key).trim() : slugify(name);
  // mapKey is unique in Org. Treat blank as null.
  const mapKey = mapKeyRaw.length > 0 ? mapKeyRaw : null;
  // slug is unique; derive from name when not provided.
  let slug = mapKey ?? slugify(name);
  // Collision-avoidance: append -2, -3 …
  for (let i = 2; i < 50; i++) {
    const existing = await prisma.org.findUnique({ where: { slug } });
    if (!existing) break;
    slug = `${mapKey ?? slugify(name)}-${i}`;
  }

  const row = await prisma.org.create({
    data: {
      name,
      slug,
      kind: "partner",
      color: color ? String(color).trim() : "#6366f1",
      mapKey,
      contactName: contactName ? String(contactName).trim() : null,
      contactPhone: contactPhone ? String(contactPhone).trim() : null,
      contactEmail: contactEmail ? String(contactEmail).trim() : null,
      notes: notes ? String(notes).trim() : null,
    },
    select: {
      id: true, name: true, slug: true, mapKey: true, color: true,
      contactName: true, contactPhone: true, contactEmail: true, notes: true,
    },
  });
  return NextResponse.json(shapePartner(row), { status: 201 });
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
  const { label, color, contactName, contactPhone, contactEmail, notes } = body;

  const row = await prisma.org.update({
    where: { id },
    data: {
      ...(label !== undefined ? { name: String(label).trim() } : {}),
      ...(color !== undefined ? { color: String(color).trim() } : {}),
      ...(contactName !== undefined ? { contactName: contactName ? String(contactName).trim() : null } : {}),
      ...(contactPhone !== undefined ? { contactPhone: contactPhone ? String(contactPhone).trim() : null } : {}),
      ...(contactEmail !== undefined ? { contactEmail: contactEmail ? String(contactEmail).trim() : null } : {}),
      ...(notes !== undefined ? { notes: notes ? String(notes).trim() : null } : {}),
    },
    select: {
      id: true, name: true, slug: true, mapKey: true, color: true,
      contactName: true, contactPhone: true, contactEmail: true, notes: true,
    },
  });

  return NextResponse.json(shapePartner(row));
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const veto = adminForbidden(session); if (veto) return veto;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Soft delete — partner refs (Settlement.partnerOrgId etc.) use SetNull,
  // but we'd rather keep the row archived so historical lookups still work.
  await prisma.org.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
