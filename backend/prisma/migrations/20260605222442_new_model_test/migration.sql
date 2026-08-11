-- 1. Crear la tabla Driver, pero agregamos una columna temporal para no perder el rastro
CREATE TABLE "Driver" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "document" TEXT,
    "phone" TEXT,
    "temp_vehicle_id" INTEGER, -- <-- NUEVO: Guarda el ID del vehículo de donde salió

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- 2. Agregar temporalmente la columna driverId a Vehicle como anulable
ALTER TABLE "Vehicle" ADD COLUMN "driverId" INTEGER;

-- 3. Migrar los datos guardando la conexión exacta con el vehículo (v."id")
INSERT INTO "Driver" ("name", "document", "phone", "temp_vehicle_id") 
SELECT "drivername", "driverdoc", "driverphone", "id" 
FROM "Vehicle" 
WHERE "drivername" IS NOT NULL OR "driverdoc" IS NOT NULL OR "driverphone" IS NOT NULL;

-- 4. Vincular los registros usando la conexión exacta (ID a ID), sin depender de los textos
UPDATE "Vehicle" v
SET "driverId" = d."id"
FROM "Driver" d
WHERE d."temp_vehicle_id" = v."id"; -- <-- Vínculo perfecto 1 a 1

-- 4.5. Limpiar la tabla Driver borrando la columna temporal
ALTER TABLE "Driver" DROP COLUMN "temp_vehicle_id";

-- 5. Crear el índice único para driverId en la tabla Vehicle
CREATE UNIQUE INDEX "Vehicle_driverId_key" ON "Vehicle"("driverId");

-- 6. Agregar la llave foránea (Foreign Key)
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Eliminar las columnas antiguas de la tabla Vehicle
ALTER TABLE "Vehicle" 
DROP COLUMN "driverdoc",
DROP COLUMN "drivername",
DROP COLUMN "driverphone";