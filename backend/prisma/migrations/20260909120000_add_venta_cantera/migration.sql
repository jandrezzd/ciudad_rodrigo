-- Ventas de cantera: flujo nuevo e independiente del de salida/llegada.
-- Esta migración SOLO crea tablas nuevas. No hay un ALTER sobre ninguna tabla
-- existente: las llaves foráneas y sus columnas viven todas del lado nuevo, y
-- las relaciones inversas declaradas en User/Vehicle/Material/Cantera son
-- campos virtuales de Prisma que no generan SQL.

-- CreateTable
CREATE TABLE "CanteraVentaQr" (
    "id" SERIAL NOT NULL,
    "canteraId" INTEGER NOT NULL,
    "qrcode" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanteraVentaQr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaCantera" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "canteraId" INTEGER NOT NULL,
    "qrcode" TEXT NOT NULL,
    "vehicleId" INTEGER,
    "vehicleIdText" TEXT NOT NULL,
    "plate" TEXT,
    "driverName" TEXT,
    "materialId" INTEGER NOT NULL,
    "m3" DOUBLE PRECISION NOT NULL,
    "comprador" TEXT,
    "observation" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "platePath" TEXT,
    "materialPath" TEXT,
    "driverPath" TEXT,
    "vehiclePath" TEXT,

    CONSTRAINT "VentaCantera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanteraVentaQr_canteraId_key" ON "CanteraVentaQr"("canteraId");

-- CreateIndex
CREATE UNIQUE INDEX "CanteraVentaQr_qrcode_key" ON "CanteraVentaQr"("qrcode");

-- CreateIndex
CREATE UNIQUE INDEX "VentaCantera_uuid_key" ON "VentaCantera"("uuid");

-- CreateIndex
CREATE INDEX "VentaCantera_canteraId_capturedAt_idx" ON "VentaCantera"("canteraId", "capturedAt");

-- CreateIndex
CREATE INDEX "VentaCantera_capturedAt_idx" ON "VentaCantera"("capturedAt");

-- CreateIndex
CREATE INDEX "VentaCantera_vehicleId_idx" ON "VentaCantera"("vehicleId");

-- AddForeignKey
ALTER TABLE "CanteraVentaQr" ADD CONSTRAINT "CanteraVentaQr_canteraId_fkey" FOREIGN KEY ("canteraId") REFERENCES "Cantera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_canteraId_fkey" FOREIGN KEY ("canteraId") REFERENCES "Cantera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
