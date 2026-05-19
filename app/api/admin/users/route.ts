import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";

export async function GET() {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [users, allCities, zones, clusters] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true, role: true, designation: true, createdAt: true, cityId: true, reportsToId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.city.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.zone.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, leadId: true, cityId: true },
      orderBy: { name: "asc" },
    }),
    prisma.cluster.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, zoneId: true, rps: { select: { id: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  // Deduplicate cities by name — keep first occurrence as canonical
  const canonicalCityId: Record<string, string> = {}; // any city id → canonical id
  const seenNames = new Map<string, string>();         // lower name → canonical id
  const cities = allCities.filter(c => {
    const key = c.name.trim().toLowerCase();
    if (seenNames.has(key)) {
      canonicalCityId[c.id] = seenNames.get(key)!;
      return false;
    }
    seenNames.set(key, c.id);
    canonicalCityId[c.id] = c.id;
    return true;
  });

  // Remap zone cityId to the canonical city so the client filter works correctly
  const remappedZones = zones.map(z => ({
    ...z,
    cityId: z.cityId ? (canonicalCityId[z.cityId] ?? z.cityId) : null,
  }));

  return Response.json({ users, cities, zones: remappedZones, clusters });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, email: rawEmail, password, role: req_role, designation: req_designation } = await req.json();
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return Response.json({ error: "Email already in use" }, { status: 400 });
  }

  // Only super-admin can create admin users
  const role = ["admin", "member", "viewer", "budget-admin"].includes(req_role) ? req_role : "member";
  if (role === "admin" && !isSuperAdmin(session)) {
    return Response.json({ error: "Only the super-admin can create admin users" }, { status: 403 });
  }
  const VALID_DESIGNATIONS = ["RP", "ZL", "PM", "Other"];
  const designation = VALID_DESIGNATIONS.includes(req_designation) ? req_designation : "Other";
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name: name || null, email, password: hashed, role, designation },
    select: { id: true, name: true, email: true, role: true, designation: true, createdAt: true },
  });

  auditLog({
    entityType: "User",
    entityId: user.id,
    userId: session!.user!.id!,
    action: "created",
    newValue: JSON.stringify({ email, role, designation }),
  });

  return Response.json(user, { status: 201 });
}
