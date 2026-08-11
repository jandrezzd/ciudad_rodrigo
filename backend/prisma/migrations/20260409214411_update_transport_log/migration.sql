-- DropForeignKey
ALTER TABLE "TransportLog" DROP CONSTRAINT "TransportLog_ownerId_fkey";

-- AlterTable
ALTER TABLE "TransportLog" ALTER COLUMN "ownerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
