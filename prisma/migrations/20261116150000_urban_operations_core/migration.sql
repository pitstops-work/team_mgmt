-- Urban Operations — core tables (docs/urban-operations-spec.md, Phase 1).
--
-- A new, self-contained portal at /urban: the RP's support-and-review tool for
-- partner-delivered programmes. Ten new uo_* tables and one view. Purely
-- additive — no existing table is altered, so the rest of the app is unaffected.
--
-- uo_effort_status is the ONE place an effort's phase and its counts are
-- defined (spec rule R3). Screens read it; they never count for themselves.
-- "Today" is the IST calendar date (spec rule R2), matching lib/urban/time.ts.

-- CreateTable
CREATE TABLE "uo_place" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "level" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "legacyId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uo_place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mis" TEXT,
    "legacyOrgId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uo_partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_programme" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uo_programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_assignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "programmeKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uo_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_effort" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "partnerId" TEXT,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startMode" TEXT NOT NULL,
    "startedOn" DATE NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uo_effort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_task" (
    "id" TEXT NOT NULL,
    "effortId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sessionId" TEXT,
    "key" TEXT,
    "phase" TEXT,
    "title" TEXT NOT NULL,
    "ownerId" TEXT,
    "who" TEXT NOT NULL DEFAULT 'us',
    "due" DATE,
    "dueSource" TEXT NOT NULL DEFAULT 'auto',
    "status" TEXT NOT NULL DEFAULT 'open',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "checkType" TEXT NOT NULL DEFAULT 'tick',
    "checkConfig" JSONB,
    "result" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceTaskId" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uo_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_session" (
    "id" TEXT NOT NULL,
    "effortId" TEXT NOT NULL,
    "routineKey" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedById" TEXT NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedNote" TEXT,

    CONSTRAINT "uo_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_evidence" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "transcript" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uo_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_reading" (
    "id" TEXT NOT NULL,
    "effortId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT '',
    "value" DOUBLE PRECISION NOT NULL,
    "asOf" DATE NOT NULL,
    "sessionId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "enteredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uo_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uo_event" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uo_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uo_place_parentId_idx" ON "uo_place"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "uo_place_level_legacyId_key" ON "uo_place"("level", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "uo_partner_name_key" ON "uo_partner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uo_partner_legacyOrgId_key" ON "uo_partner"("legacyOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "uo_programme_key_key" ON "uo_programme"("key");

-- CreateIndex
CREATE INDEX "uo_assignment_placeId_idx" ON "uo_assignment"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "uo_assignment_userId_placeId_programmeKey_key" ON "uo_assignment"("userId", "placeId", "programmeKey");

-- CreateIndex
CREATE INDEX "uo_effort_ownerId_idx" ON "uo_effort"("ownerId");

-- CreateIndex
CREATE INDEX "uo_effort_placeId_idx" ON "uo_effort"("placeId");

-- CreateIndex
CREATE INDEX "uo_effort_programmeId_idx" ON "uo_effort"("programmeId");

-- CreateIndex
CREATE INDEX "uo_task_effortId_kind_idx" ON "uo_task"("effortId", "kind");

-- CreateIndex
CREATE INDEX "uo_task_ownerId_status_due_idx" ON "uo_task"("ownerId", "status", "due");

-- CreateIndex
CREATE INDEX "uo_task_sessionId_idx" ON "uo_task"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "uo_session_effortId_routineKey_period_key" ON "uo_session"("effortId", "routineKey", "period");

-- CreateIndex
CREATE INDEX "uo_evidence_taskId_idx" ON "uo_evidence"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "uo_reading_effortId_key_dimension_asOf_key" ON "uo_reading"("effortId", "key", "dimension", "asOf");

-- CreateIndex
CREATE INDEX "uo_event_entity_entityId_idx" ON "uo_event"("entity", "entityId");

-- CreateIndex
CREATE INDEX "uo_event_actorId_at_idx" ON "uo_event"("actorId", "at");

-- AddForeignKey
ALTER TABLE "uo_place" ADD CONSTRAINT "uo_place_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "uo_place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_assignment" ADD CONSTRAINT "uo_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_assignment" ADD CONSTRAINT "uo_assignment_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "uo_place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_effort" ADD CONSTRAINT "uo_effort_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "uo_programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_effort" ADD CONSTRAINT "uo_effort_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "uo_place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_effort" ADD CONSTRAINT "uo_effort_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "uo_partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_effort" ADD CONSTRAINT "uo_effort_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_task" ADD CONSTRAINT "uo_task_effortId_fkey" FOREIGN KEY ("effortId") REFERENCES "uo_effort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_task" ADD CONSTRAINT "uo_task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "uo_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_task" ADD CONSTRAINT "uo_task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_session" ADD CONSTRAINT "uo_session_effortId_fkey" FOREIGN KEY ("effortId") REFERENCES "uo_effort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_evidence" ADD CONSTRAINT "uo_evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "uo_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_reading" ADD CONSTRAINT "uo_reading_effortId_fkey" FOREIGN KEY ("effortId") REFERENCES "uo_effort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uo_reading" ADD CONSTRAINT "uo_reading_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "uo_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Derived state per effort (spec §3 phase, §8 definitions) ───────────────
CREATE VIEW "uo_effort_status" AS
SELECT
  e."id" AS "effortId",
  COUNT(t."id") FILTER (WHERE t."kind" = 'setup')                                            AS "setupTotal",
  COUNT(t."id") FILTER (WHERE t."kind" = 'setup' AND t."status" <> 'open')                   AS "setupClosed",
  COUNT(t."id") FILTER (WHERE t."kind" = 'setup' AND t."required" AND t."status" = 'open')   AS "setupRequiredOpen",
  COUNT(t."id") FILTER (WHERE t."status" = 'open'
                          AND t."due" < (now() AT TIME ZONE 'Asia/Kolkata')::date)           AS "overdue",
  COUNT(t."id") FILTER (WHERE t."kind" = 'followup' AND t."status" = 'open')                 AS "followupsOpen",
  COUNT(t."id") FILTER (WHERE t."kind" = 'followup' AND t."status" = 'open' AND t."who" = 'partner') AS "followupsPartner",
  MIN(t."due")  FILTER (WHERE t."status" = 'open')                                           AS "nextDue",
  MAX(t."doneAt")                                                                            AS "lastDoneAt",
  CASE
    WHEN e."closedAt" IS NOT NULL THEN 'closed'
    WHEN COUNT(t."id") FILTER (WHERE t."kind" = 'setup' AND t."required" AND t."status" = 'open') > 0 THEN 'setting_up'
    WHEN jsonb_array_length(COALESCE(p."settings"->'routines', '[]'::jsonb)) > 0 THEN 'running'
    -- A drive (setup only, no routines) whose setup is finished: waits for an explicit close.
    ELSE 'ready_to_close'
  END AS "phase"
FROM "uo_effort" e
JOIN "uo_programme" p ON p."id" = e."programmeId"
LEFT JOIN "uo_task" t ON t."effortId" = e."id"
GROUP BY e."id", e."closedAt", p."settings";
