-- Expose model instances read-only at /models-public/<slug> when publicSlug is set.
-- Unique so URLs are stable; nullable so most instances stay private.

ALTER TABLE "ModelInstance" ADD COLUMN "publicSlug" TEXT;

CREATE UNIQUE INDEX "ModelInstance_publicSlug_key" ON "ModelInstance"("publicSlug");
