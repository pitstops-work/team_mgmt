import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";
import { autoAdvancePitstopFromItem } from "@/lib/autoAdvancePitstop";
import { buildRbacContext, can } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const pitstopId = formData.get("pitstopId") as string | null;
  const goalId = formData.get("goalId") as string | null;
  const checklistItemId = formData.get("checklistItemId") as string | null;

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  // Attaching a file to a checklist item (and closing Upload-typed items)
  // mutates the checklist — require checklist_item.update for that path.
  if (checklistItemId) {
    const ctx = await buildRbacContext(session);
    if (!ctx || !(await can(ctx, "checklist_item", "update"))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Sanitise filename for use as Blob pathname
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  let url: string;
  try {
    // Convert to Buffer first — avoids stream-consumption issues in some runtimes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const blob = await put(safeName, buffer, {
      access: "private",
      contentType: file.type || "application/octet-stream",
    });
    url = blob.url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Blob upload failed:", msg);
    return Response.json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }

  if (checklistItemId) {
    // Raw SQL insert to avoid Lambda warm-cache issues with new checklistItemId column
    const id = crypto.randomUUID().replace(/-/g, "");
    await prisma.$executeRaw`
      INSERT INTO "Attachment" (id, name, type, url, size, "mimeType", "checklistItemId", "createdAt")
      VALUES (
        ${id}, ${file.name}, 'File'::"AttachmentType", ${url},
        ${file.size ?? null}::int, ${file.type || null},
        ${checklistItemId}, NOW()
      )
    `;
    // Only close the item if it is Upload-typed
    const [ci] = await prisma.$queryRaw<{ completionType: string }[]>`
      SELECT "completionType"::text FROM "ChecklistItem" WHERE id = ${checklistItemId}
    `;
    if (ci?.completionType === 'Upload') {
      await prisma.$executeRaw`
        UPDATE "ChecklistItem"
        SET
          status        = 'Done'::"ChecklistItemStatus",
          checked       = TRUE,
          "completedAt" = NOW(),
          "updatedAt"   = NOW()
        WHERE id = ${checklistItemId}
      `;
      await autoAdvancePitstopFromItem(checklistItemId);
    }
    const attachment = await prisma.$queryRaw<{ id: string; name: string; url: string }[]>`
      SELECT id, name, url FROM "Attachment" WHERE id = ${id} LIMIT 1
    `;
    return Response.json(attachment[0], { status: 201 });
  }

  const attachment = await prisma.attachment.create({
    data: {
      name: file.name,
      type: "File",
      url,
      size: file.size,
      mimeType: file.type,
      pitstopId: pitstopId ?? undefined,
      goalId: goalId ?? undefined,
    },
  });

  return Response.json(attachment, { status: 201 });
}
