CREATE TABLE "GoalTemplateDef" (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  category    TEXT        NOT NULL,
  icon        TEXT        NOT NULL DEFAULT '🎯',
  "needsDomain" TEXT,
  "sortOrder" INT         NOT NULL DEFAULT 0,
  parameters  JSONB       NOT NULL DEFAULT '[]',
  pitstops    JSONB       NOT NULL DEFAULT '[]',
  "isActive"  BOOLEAN     NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "GoalTemplateDef_category_idx" ON "GoalTemplateDef"(category);
CREATE INDEX "GoalTemplateDef_isActive_idx" ON "GoalTemplateDef"("isActive");
