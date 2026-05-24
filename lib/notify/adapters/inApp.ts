import prisma from "@/lib/prisma";
import {
  type AdapterResult,
  type DispatchInput,
  WIKI_KIND_TO_NOTIFICATION_TYPE,
} from "../types";

export async function sendInApp(input: DispatchInput): Promise<AdapterResult> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: WIKI_KIND_TO_NOTIFICATION_TYPE[input.kind],
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });
    return { channel: "inApp", status: "sent" };
  } catch (err) {
    return {
      channel: "inApp",
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
