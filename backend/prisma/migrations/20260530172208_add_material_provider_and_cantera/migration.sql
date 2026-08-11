-- CreateTable
CREATE TABLE "MaterialProvider" (
    "id" SERIAL NOT NULL,
    "ruc" TEXT NOT NULL,
    "razonsocial" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provincia" TEXT,
    "canton" TEXT,
    "direccion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cantera" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "provincia" TEXT,
    "canton" TEXT,
    "direccion" TEXT,
    "materialProviderId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cantera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialProvider_ruc_key" ON "MaterialProvider"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialProvider_email_key" ON "MaterialProvider"("email");

-- AddForeignKey
ALTER TABLE "Cantera" ADD CONSTRAINT "Cantera_materialProviderId_fkey" FOREIGN KEY ("materialProviderId") REFERENCES "MaterialProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
