import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { name, email, password, inviteCode } = await req.json();

  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  // Require invite code unless this is the very first user (bootstrapping)
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    const setting = await prisma.appSetting.findUnique({ where: { key: "inviteCode" } });
    if (!setting || inviteCode !== setting.value) {
      return Response.json({ error: "Invalid invite code" }, { status: 400 });
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "Email already in use" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashed },
  });

  return Response.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
}
