import prisma from "@/lib/prisma";
import type { AdapterResult, DispatchInput } from "../types";

// Stub: WhatsApp provider not yet selected (see PR3 design notes). We still
// record intent so that, once the adapter ships, the team can audit the
// backlog and decide whether to replay any missed notifications.
export async function sendWhatsApp(input: DispatchInput): Promise<AdapterResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { phone: true, whatsappOptIn: true },
  });

  if (!user?.phone) {
    return { channel: "whatsapp", status: "skipped", error: "no phone on file" };
  }
  if (!user.whatsappOptIn) {
    return { channel: "whatsapp", status: "skipped", error: "user opted out" };
  }

  // Eligible recipient, but no provider wired up yet. Record intent so the
  // future adapter can decide whether to backfill.
  return { channel: "whatsapp", status: "intended_no_adapter" };
}
