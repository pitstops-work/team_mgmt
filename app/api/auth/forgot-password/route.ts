import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";

const GENERIC_RESPONSE = {
  message: "If that email is registered, you'll receive a reset link shortly.",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;

    if (!email) {
      return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }

    // Delete any existing tokens for this email
    await prisma.passwordResetToken.deleteMany({ where: { email: user.email! } });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        email: user.email!,
        token,
        expiresAt,
      },
    });

    await sendPasswordResetEmail(user.email!, token);
  } catch (err) {
    console.error("[forgot-password]", err);
    // Still return generic response to avoid leaking information
  }

  return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
}
