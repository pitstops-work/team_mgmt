import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";

function generateCode() {
  return randomBytes(4).toString("hex").toUpperCase(); // e.g. "A3F7B2C1"
}

async function getOrCreateCode() {
  const existing = await prisma.appSetting.findUnique({ where: { key: "inviteCode" } });
  if (existing) return existing.value;
  const code = generateCode();
  await prisma.appSetting.create({ data: { key: "inviteCode", value: code } });
  return code;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const code = await getOrCreateCode();
  return Response.json({ code });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const code = generateCode();
  await prisma.appSetting.upsert({
    where: { key: "inviteCode" },
    update: { value: code },
    create: { key: "inviteCode", value: code },
  });
  return Response.json({ code });
}
