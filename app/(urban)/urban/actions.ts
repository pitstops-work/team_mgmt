"use server";

// Effort actions. Every exported action starts with requireActorForAction()
// and authorize() (enforced by scripts/check-urban-access.mjs).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireActorForAction, authorize, assignableOwnerIds, UrbanAccessError } from "@/lib/urban/access";
import { createEffort, UrbanInputError } from "@/lib/urban/efforts";
import { START_MODES, type StartMode } from "@/lib/urban/settings";
import { todayIST } from "@/lib/urban/time";

export type FormState = { error: string | null };

function message(e: unknown): string {
  if (e instanceof UrbanAccessError || e instanceof UrbanInputError) return e.message;
  console.error("[urban] action failed", e);
  return "Something went wrong — nothing was saved.";
}

export async function createEffortAction(_prev: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "effort.create");

    const ownerId = String(form.get("ownerId") ?? "");
    const allowed = await assignableOwnerIds(actor);
    if (allowed !== "any" && !allowed.includes(ownerId)) throw new UrbanAccessError("You can only give an effort to yourself or someone in your team");
    if (!(await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } }))) throw new UrbanInputError("Pick an owner");

    const startMode = String(form.get("startMode") ?? "") as StartMode;
    if (!START_MODES.includes(startMode)) throw new UrbanInputError("Say whether this is new or already running");
    const startedOn = String(form.get("startedOn") ?? "") || todayIST();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) throw new UrbanInputError("Pick a start date");

    const res = await createEffort(actor.id, {
      programmeId: String(form.get("programmeId") ?? ""),
      placeId: String(form.get("placeId") ?? ""),
      partnerId: String(form.get("partnerId") ?? "") || null,
      ownerId,
      title: String(form.get("title") ?? ""),
      startMode,
      startedOn,
    });
    id = res.id;
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/urban", "layout");
  redirect(`/urban/efforts/${id}`);
}
