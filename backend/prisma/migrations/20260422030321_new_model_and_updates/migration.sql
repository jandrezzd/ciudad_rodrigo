-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('CRUDO', 'BASE', 'SUB_BASE', 'MEJORAMIENTO', 'PIEDRA_BOLA', 'PIEDRA_DEFENSA', 'RIPIO', 'ARENA_LAVADA', 'ARENA_DE_BANCO', 'ARENA_DE_PLAYA', 'ARENA_DE_RIO_COLIMES', 'CISCO_CRUDO', 'CISCO_LAVADO');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'JEFE_DE_OBRA';

-- AlterEnum
ALTER TYPE "TransportStatus" ADD VALUE 'VALIDADO';

-- AlterTable
ALTER TABLE "TransportLog" ADD COLUMN     "materialId" INTEGER;

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "materialType" "MaterialType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TransportLog" ADD CONSTRAINT "TransportLog_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
