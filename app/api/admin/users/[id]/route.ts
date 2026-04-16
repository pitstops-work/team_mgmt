import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const VALID_ROLES = ["admin", "member", "viewer"] as const;

function isAdmin(email: string | null | undefined) {
  return email && email === process.env.ADMIN_EMAIL;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { name, email, role } = await req.json();

  // Validate role
  if (role && !VALID_ROLES.includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  // If email is changing, check it's not already taken
  if (email) {
    const conflict = await prisma.user.findFirst({
      where: { email, NOT: { id } },
      select: { id: true },
    });
    if (conflict) {
      return Response.json({ error: "Email already in use" }, { status: 400 });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name || null }),
      ...(email && { email }),
      ...(role && { role }),
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true, image: true },
  });

  return Response.json(user);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session!.user!.id) {
    return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
