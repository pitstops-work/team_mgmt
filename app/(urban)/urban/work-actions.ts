"use server";

// Work actions (Phase 2). Every exported action: requireActorForAction(), find
// the effort the thing belongs to, authorize(actor, "effort.work", effortId).
// Enforced by scripts/check-urban-access.mjs.
import { revalidatePath } from "next/cache";
import { requireActorForAction, authorize, UrbanAccessError } from "@/lib/urban/access";
import { UrbanInputError } from "@/lib/urban/efforts";
import {
  completeTask, undoTask, skipTask, rescheduleTask, addFollowup,
  startSession, arriveSession, closeSession, effortIdOfTask, effortIdOfSession,
  type CompleteInput,
} from "@/lib/urban/work";
import type { Ymd } from "@/lib/urban/time";

export type WorkResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UrbanAccessError) return { ok: false, error: "You can't change this effort" };
  if (e instanceof UrbanInputError) return { ok: false, error: e.message };
  console.error("[urban] work action failed", e);
  return { ok: false, error: "Something went wrong — nothing was saved." };
}

const done = () => revalidatePath("/urban", "layout");

async function effortOfTaskOrThrow(taskId: string) {
  const id = await effortIdOfTask(taskId);
  if (!id) throw new UrbanInputError("That item no longer exists");
  return id;
}

export async function completeTaskAction(taskId: string, input: CompleteInput): Promise<WorkResult<{ followupsRaised: number }>> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "effort.work", await effortOfTaskOrThrow(taskId));
    const r = await completeTask(actor, taskId, input);
    done();
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}

export async function undoTaskAction(taskId: string, reason: string): Promise<WorkResult> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "effort.work", await effortOfTaskOrThrow(taskId));
    await undoTask(actor, taskId, reason);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function skipTaskAction(taskId: string, reason: string): Promise<WorkResult> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "effort.work", await effortOfTaskOrThrow(taskId));
    await skipTask(actor, taskId, reason);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rescheduleTaskAction(taskId: string, due: Ymd, reason: string): Promise<WorkResult> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "effort.work", await effortOfTaskOrThrow(taskId));
    await rescheduleTask(actor, taskId, due, reason);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addFollowupAction(effortId: string, input: { title: string; who: "us" | "partner"; due: Ymd; sourceTaskId?: string | null }): Promise<WorkResult> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "effort.work", effortId);
    await addFollowup(actor, effortId, input);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function startSessionAction(effortId: string, routineKey: string): Promise<WorkResult<{ sessionId: string }>> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "effort.work", effortId);
    const sessionId = await startSession(actor, effortId, routineKey);
    done();
    return { ok: true, data: { sessionId } };
  } catch (e) {
    return fail(e);
  }
}

export async function arriveSessionAction(sessionId: string): Promise<WorkResult> {
  try {
    const actor = await requireActorForAction();
    const effortId = await effortIdOfSession(sessionId);
    if (!effortId) throw new UrbanInputError("That session no longer exists");
    await authorize(actor, "effort.work", effortId);
    await arriveSession(actor, sessionId);
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function closeSessionAction(sessionId: string, note: string): Promise<WorkResult<{ carried: number }>> {
  try {
    const actor = await requireActorForAction();
    const effortId = await effortIdOfSession(sessionId);
    if (!effortId) throw new UrbanInputError("That session no longer exists");
    await authorize(actor, "effort.work", effortId);
    const r = await closeSession(actor, sessionId, note);
    done();
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}
