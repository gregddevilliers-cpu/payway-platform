-- AlterTable: change anomalyFlags from text[] to jsonb
ALTER TABLE "FuelTransaction" DROP COLUMN "anomalyFlags";
ALTER TABLE "FuelTransaction" ADD COLUMN "anomalyFlags" JSONB NOT NULL DEFAULT '[]';
