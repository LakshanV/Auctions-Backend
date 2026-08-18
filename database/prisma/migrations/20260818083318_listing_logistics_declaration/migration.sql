-- AlterTable
ALTER TABLE "listing" ADD COLUMN     "default_incoterm" TEXT,
ADD COLUMN     "delivery_available" BOOLEAN,
ADD COLUMN     "pickup_available" BOOLEAN;
