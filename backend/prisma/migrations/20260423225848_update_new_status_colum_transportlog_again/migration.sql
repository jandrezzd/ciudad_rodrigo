/*
  Warnings:

  - The `initialStatus` column on the `TransportLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "TransportLog" DROP COLUMN "initialStatus",
ADD COLUMN     "initialStatus" "TransportStatus";
