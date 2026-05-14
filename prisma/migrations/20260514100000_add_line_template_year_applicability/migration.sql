-- AddColumn LineTemplate: year applicability + expansion scale
ALTER TABLE "LineTemplate" ADD COLUMN "applyY1" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LineTemplate" ADD COLUMN "applyY2" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LineTemplate" ADD COLUMN "applyY3" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LineTemplate" ADD COLUMN "y2UnitsScale" DOUBLE PRECISION;
ALTER TABLE "LineTemplate" ADD COLUMN "y3UnitsScale" DOUBLE PRECISION;
