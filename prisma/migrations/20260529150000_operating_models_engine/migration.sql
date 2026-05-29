-- Operating Models engine: ModelTemplate, ModelGroup, ModelNode, ModelOutput, ModelInstance
-- See memory/operating_models.md for design.

-- CreateTable
CREATE TABLE "ModelTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "horizons" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelGroup" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelNode" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "groupId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "unit" TEXT,
    "kind" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "shape" JSONB NOT NULL DEFAULT '{"kind":"scalar"}',
    "defaultJson" JSONB,
    "formula" TEXT,
    "enumValues" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelOutput" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pitstopId" TEXT,
    "parentInstanceId" TEXT,
    "scenarioName" TEXT,
    "inputsJson" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelTemplate_key_key" ON "ModelTemplate"("key");

-- CreateIndex
CREATE INDEX "ModelGroup_templateId_order_idx" ON "ModelGroup"("templateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ModelGroup_templateId_key_key" ON "ModelGroup"("templateId", "key");

-- CreateIndex
CREATE INDEX "ModelNode_templateId_order_idx" ON "ModelNode"("templateId", "order");

-- CreateIndex
CREATE INDEX "ModelNode_groupId_idx" ON "ModelNode"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelNode_templateId_key_key" ON "ModelNode"("templateId", "key");

-- CreateIndex
CREATE INDEX "ModelOutput_templateId_order_idx" ON "ModelOutput"("templateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ModelOutput_templateId_key_key" ON "ModelOutput"("templateId", "key");

-- CreateIndex
CREATE INDEX "ModelInstance_templateId_updatedAt_idx" ON "ModelInstance"("templateId", "updatedAt");

-- CreateIndex
CREATE INDEX "ModelInstance_pitstopId_idx" ON "ModelInstance"("pitstopId");

-- CreateIndex
CREATE INDEX "ModelInstance_parentInstanceId_idx" ON "ModelInstance"("parentInstanceId");

-- AddForeignKey
ALTER TABLE "ModelGroup" ADD CONSTRAINT "ModelGroup_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ModelTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelNode" ADD CONSTRAINT "ModelNode_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ModelTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelNode" ADD CONSTRAINT "ModelNode_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModelGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOutput" ADD CONSTRAINT "ModelOutput_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ModelTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelInstance" ADD CONSTRAINT "ModelInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ModelTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelInstance" ADD CONSTRAINT "ModelInstance_parentInstanceId_fkey" FOREIGN KEY ("parentInstanceId") REFERENCES "ModelInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
