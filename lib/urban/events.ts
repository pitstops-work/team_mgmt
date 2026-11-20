// Every write in /urban logs an Event (spec rule R4). Pass the transaction
// client so the event commits or rolls back with the change it describes.
import prisma from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export type UrbanEntity =
  | "place" | "partner" | "programme" | "assignment" | "member"
  | "effort" | "task" | "session" | "evidence" | "reading";

export type EventInput = {
  actorId: string;
  entity: UrbanEntity;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

const json = (v: unknown) => (v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

export async function logEvent(db: Db, e: EventInput) {
  await db.uoEvent.create({
    data: {
      actorId: e.actorId,
      entity: e.entity,
      entityId: e.entityId,
      action: e.action,
      before: json(e.before),
      after: json(e.after),
      reason: e.reason ?? null,
    },
  });
}

export async function logEvents(db: Db, events: EventInput[]) {
  if (!events.length) return;
  await db.uoEvent.createMany({
    data: events.map((e) => ({
      actorId: e.actorId, entity: e.entity, entityId: e.entityId, action: e.action,
      before: json(e.before), after: json(e.after), reason: e.reason ?? null,
    })),
  });
}
