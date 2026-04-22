import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";

export async function GET() {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [users, allCities] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true, role: true, createdAt: true, cityId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.city.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Deduplicate cities by name (keep first occurrence per name)
  const seenNames = new Set<string>();
  const cities = allCities.filter(c => {
    const key = c.name.trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  return Response.json({ users, cities });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, email: rawEmail, password, role: req_role } = await req.json();
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return Response.json({ error: "Email already in use" }, { status: 400 });
  }

  // Only super-admin can create admin users
  const role = ["admin", "member", "viewer"].includes(req_role) ? req_role : "member";
  if (role === "admin" && !isSuperAdmin(session?.user?.email)) {
    return Response.json({ error: "Only the super-admin can create admin users" }, { status: 403 });
  }
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name: name || null, email, password: hashed, role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return Response.json(user, { status: 201 });
}
