-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- AlterTable
ALTER TABLE "VentaOrden" ADD COLUMN "placas" TEXT[] DEFAULT ARRAY[]::TEXT[];
