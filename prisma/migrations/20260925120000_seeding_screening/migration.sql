-- Seeding application screening: applications, reviews, audit events, rubrics,
-- settings and reviewer district scopes. Additive only.

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('new', 'l2_hold', 'l3_pending', 'l3_hold', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "ScreeningApplication" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "geoId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "state" TEXT,
    "district" TEXT,
    "block" TEXT,
    "theme" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "answers" JSONB NOT NULL DEFAULT '[]',
    "members" JSONB NOT NULL DEFAULT '[]',
    "criteriaFlags" JSONB NOT NULL DEFAULT '[]',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "cvText" TEXT,
    "sopText" TEXT,
    "status" "ScreeningStatus" NOT NULL DEFAULT 'new',
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conflictUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'import',
    "submittedAt" TIMESTAMP(3),
    "aiStatus" TEXT NOT NULL DEFAULT 'pending',
    "aiDraft" JSONB,
    "aiRubricVersion" INTEGER,
    "aiError" TEXT,
    "aiAttempts" INTEGER NOT NULL DEFAULT 0,
    "aiLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningReview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "reviewerId" TEXT,
    "scores" JSONB NOT NULL,
    "total" DOUBLE PRECISION,
    "rubric" JSONB NOT NULL,
    "decision" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningRubric" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dimensions" JSONB NOT NULL,
    "guidance" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "advanceMin" INTEGER NOT NULL DEFAULT 70,
    "holdMin" INTEGER NOT NULL DEFAULT 50,
    "divergence" INTEGER NOT NULL DEFAULT 15,
    "dailyCap" INTEGER NOT NULL DEFAULT 20,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "geoId" TEXT NOT NULL,
    "districts" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ScreeningScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningApplication_ref_key" ON "ScreeningApplication"("ref");

-- CreateIndex
CREATE INDEX "ScreeningApplication_geoId_status_idx" ON "ScreeningApplication"("geoId", "status");

-- CreateIndex
CREATE INDEX "ScreeningApplication_aiStatus_aiLockedAt_idx" ON "ScreeningApplication"("aiStatus", "aiLockedAt");

-- CreateIndex
CREATE INDEX "ScreeningApplication_email_idx" ON "ScreeningApplication"("email");

-- CreateIndex
CREATE INDEX "ScreeningReview_applicationId_idx" ON "ScreeningReview"("applicationId");

-- CreateIndex
CREATE INDEX "ScreeningReview_reviewerId_createdAt_idx" ON "ScreeningReview"("reviewerId", "createdAt");

-- CreateIndex
CREATE INDEX "ScreeningEvent_applicationId_createdAt_idx" ON "ScreeningEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ScreeningEvent_type_createdAt_idx" ON "ScreeningEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningRubric_key_key" ON "ScreeningRubric"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningScope_userId_geoId_key" ON "ScreeningScope"("userId", "geoId");

-- AddForeignKey
ALTER TABLE "ScreeningApplication" ADD CONSTRAINT "ScreeningApplication_geoId_fkey" FOREIGN KEY ("geoId") REFERENCES "SeedingGeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningReview" ADD CONSTRAINT "ScreeningReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ScreeningApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningReview" ADD CONSTRAINT "ScreeningReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningEvent" ADD CONSTRAINT "ScreeningEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ScreeningApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningEvent" ADD CONSTRAINT "ScreeningEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningScope" ADD CONSTRAINT "ScreeningScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningScope" ADD CONSTRAINT "ScreeningScope_geoId_fkey" FOREIGN KEY ("geoId") REFERENCES "SeedingGeo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

