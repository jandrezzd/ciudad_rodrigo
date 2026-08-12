-- =============================================================================
-- Migración 1.2: Separar TransportLog en TransportTrip / TransportDeparture /
--                TransportArrival
--
-- COMPROBACIÓN PREVIA — ejecutar manualmente ANTES de aplicar:
--   SELECT count(*) FROM "TransportLog"
--     WHERE "arrivalAt" IS NOT NULL AND "arrivalM3" IS NULL;
-- Si devuelve > 0, esos registros se migran con m3 = 0 (COALESCE).
-- Decidir si ese comportamiento es aceptable antes de continuar.
-- =============================================================================

-- 1. pgcrypto para gen_random_uuid() en PostgreSQL < 13
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enum RecordSource (nuevo)
CREATE TYPE "RecordSource" AS ENUM ('ONLINE', 'OFFLINE', 'MIGRATED');

-- =============================================================================
-- 3. Crear las tres tablas sin FKs ni índices únicos todavía
-- =============================================================================

CREATE TABLE "TransportTrip" (
    "id"            SERIAL NOT NULL,
    "uuid"          UUID NOT NULL,
    "userId"        INTEGER NOT NULL,
    "userArrivalId" INTEGER,
    "vehicleId"     INTEGER NOT NULL,
    "ownerId"       INTEGER,
    "clientId"      INTEGER NOT NULL,
    "constSiteId"   INTEGER NOT NULL,
    "planningId"    INTEGER,
    "materialId"    INTEGER,
    "userRoleType"  "UserRoleType",
    "numeroFactura" TEXT,
    "departureAt"   TIMESTAMP(3) NOT NULL,
    "arrivalAt"     TIMESTAMP(3),
    "deviationM3"   DOUBLE PRECISION,
    "observation"   TEXT,
    "status"        "TransportStatus" NOT NULL DEFAULT 'EN_PROGRESO',
    "initialStatus" "TransportStatus",
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransportTrip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportDeparture" (
    "id"             SERIAL NOT NULL,
    "tripId"         INTEGER NOT NULL,
    "clientUuid"     UUID NOT NULL,
    "source"         "RecordSource" NOT NULL DEFAULT 'ONLINE',
    "capturedAt"     TIMESTAMP(3) NOT NULL,
    "receivedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"         INTEGER NOT NULL,
    "m3"             DOUBLE PRECISION NOT NULL,
    "m3Corrected"    DOUBLE PRECISION,
    "lat"            DOUBLE PRECISION NOT NULL,
    "lng"            DOUBLE PRECISION NOT NULL,
    "driverPhoto"    TEXT,
    "vehiclePhoto"   TEXT,
    "platePhoto"     TEXT,
    "materialPhoto1" TEXT,
    "materialPhoto2" TEXT,
    CONSTRAINT "TransportDeparture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportArrival" (
    "id"             SERIAL NOT NULL,
    "tripId"         INTEGER NOT NULL,
    "clientUuid"     UUID NOT NULL,
    "source"         "RecordSource" NOT NULL DEFAULT 'ONLINE',
    "capturedAt"     TIMESTAMP(3) NOT NULL,
    "receivedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"         INTEGER NOT NULL,
    "m3"             DOUBLE PRECISION NOT NULL,
    "m3Corrected"    DOUBLE PRECISION,
    "lat"            DOUBLE PRECISION,
    "lng"            DOUBLE PRECISION,
    "abscisa"        INTEGER,
    "driverPhoto"    TEXT,
    "vehiclePhoto"   TEXT,
    "platePhoto"     TEXT,
    "materialPhoto1" TEXT,
    "materialPhoto2" TEXT,
    CONSTRAINT "TransportArrival_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- 4. Poblar TransportTrip preservando los mismos IDs que TransportLog
--    (los deep-links del frontend y los IDs en Report.reportData siguen válidos)
-- =============================================================================

INSERT INTO "TransportTrip" (
    "id", "uuid",
    "userId", "userArrivalId", "vehicleId", "ownerId",
    "clientId", "constSiteId", "planningId", "materialId",
    "userRoleType", "numeroFactura",
    "departureAt", "arrivalAt",
    "deviationM3", "observation",
    "status", "initialStatus",
    "createdAt", "updatedAt"
)
SELECT
    t."id",
    gen_random_uuid(),
    t."userId", t."userArrivalId", t."vehicleId", t."ownerId",
    t."clientId", t."constSiteId", t."planningId", t."materialId",
    t."userRoleType", t."numeroFactura",
    t."departureAt", t."arrivalAt",
    t."deviationM3", t."observation",
    t."status",
    -- Reconstruir initialStatus cuando falta en registros ya completados
    COALESCE(
        t."initialStatus",
        CASE
            WHEN t."arrivalAt" IS NULL THEN NULL
            WHEN ABS(COALESCE(t."deviationM3", 0)) >= 1 THEN 'ALERTA'::"TransportStatus"
            ELSE 'COMPLETADO'::"TransportStatus"
        END
    ),
    t."createdAt",
    t."createdAt"   -- updatedAt inicial = createdAt para registros migrados
FROM "TransportLog" t;

-- Avanzar la secuencia al máximo id insertado para que los nuevos registros no colisionen
SELECT setval('"TransportTrip_id_seq"', (SELECT MAX("id") FROM "TransportTrip"));

-- =============================================================================
-- 5. Poblar TransportDeparture — un registro por cada fila de TransportLog
-- =============================================================================

INSERT INTO "TransportDeparture" (
    "tripId", "clientUuid", "source",
    "capturedAt", "receivedAt",
    "userId", "m3", "m3Corrected",
    "lat", "lng",
    "driverPhoto", "vehiclePhoto", "platePhoto", "materialPhoto1", "materialPhoto2"
)
SELECT
    t."id",                          -- tripId = mismo id que TransportTrip
    gen_random_uuid(),               -- clientUuid generado (dato original desconocido)
    'MIGRATED'::"RecordSource",
    t."departureAt",                 -- momento real de la salida
    t."createdAt",                   -- receivedAt ≈ momento de sincronización original
    t."userId",
    t."departureM3",
    t."departureM3Corrected",
    t."departureLat",
    t."departureLng",
    t."departureDriverPhoto",
    t."departureVehiclePhoto",
    t."departurePlatePhoto",
    t."departureMaterialPhoto1",
    t."departureMaterialPhoto2"
FROM "TransportLog" t;

-- =============================================================================
-- 6. Poblar TransportArrival — solo filas con datos de llegada
-- =============================================================================

INSERT INTO "TransportArrival" (
    "tripId", "clientUuid", "source",
    "capturedAt", "receivedAt",
    "userId", "m3", "m3Corrected",
    "lat", "lng", "abscisa",
    "driverPhoto", "vehiclePhoto", "platePhoto", "materialPhoto1", "materialPhoto2"
)
SELECT
    t."id",
    gen_random_uuid(),
    'MIGRATED'::"RecordSource",
    COALESCE(t."arrivalAt", t."createdAt"),  -- capturedAt: fallback a createdAt si solo hay m3
    t."createdAt",
    COALESCE(t."userArrivalId", t."userId"), -- userId de llegada o conductor de salida
    COALESCE(t."arrivalM3", 0),              -- m3 NOT NULL: 0 solo si arrivalM3 es null (ver nota inicial)
    t."arrivalM3Corrected",
    t."arrivalLat",
    t."arrivalLng",
    t."abscisa",
    t."arrivalDriverPhoto",
    t."arrivalVehiclePhoto",
    t."arrivalPlatePhoto",
    t."arrivalMaterialPhoto1",
    t."arrivalMaterialPhoto2"
FROM "TransportLog" t
WHERE t."arrivalAt" IS NOT NULL OR t."arrivalM3" IS NOT NULL;

-- =============================================================================
-- 7. Índices únicos (después de la carga para no penalizar el INSERT masivo)
-- =============================================================================

CREATE UNIQUE INDEX "TransportTrip_uuid_key"            ON "TransportTrip"("uuid");
CREATE UNIQUE INDEX "TransportDeparture_tripId_key"     ON "TransportDeparture"("tripId");
CREATE UNIQUE INDEX "TransportDeparture_clientUuid_key" ON "TransportDeparture"("clientUuid");
CREATE UNIQUE INDEX "TransportArrival_tripId_key"       ON "TransportArrival"("tripId");
CREATE UNIQUE INDEX "TransportArrival_clientUuid_key"   ON "TransportArrival"("clientUuid");

-- =============================================================================
-- 8. Índices de consulta
-- =============================================================================

CREATE INDEX "TransportTrip_vehicleId_status_departureAt_idx"
    ON "TransportTrip"("vehicleId", "status", "departureAt");
CREATE INDEX "TransportTrip_departureAt_idx" ON "TransportTrip"("departureAt");
CREATE INDEX "TransportTrip_arrivalAt_idx"   ON "TransportTrip"("arrivalAt");

-- =============================================================================
-- 9. Foreign Keys
-- =============================================================================

ALTER TABLE "TransportTrip"
    ADD CONSTRAINT "TransportTrip_userId_fkey"
        FOREIGN KEY ("userId")      REFERENCES "User"("id")      ON DELETE RESTRICT   ON UPDATE CASCADE,
    ADD CONSTRAINT "TransportTrip_userArrivalId_fkey"
        FOREIGN KEY ("userArrivalId") REFERENCES "User"("id")    ON DELETE SET NULL   ON UPDATE CASCADE,
    ADD CONSTRAINT "TransportTrip_vehicleId_fkey"
        FOREIGN KEY ("vehicleId")   REFERENCES "Vehicle"("id")   ON DELETE RESTRICT   ON UPDATE CASCADE,
    ADD CONSTRAINT "TransportTrip_ownerId_fkey"
        FOREIGN KEY ("ownerId")     REFERENCES "Owner"("id")     ON DELETE SET NULL   ON UPDATE CASCADE,
    ADD CONSTRAINT "TransportTrip_clientId_fkey"
        FOREIGN KEY ("clientId")    REFERENCES "Client"("id")    ON DELETE RESTRICT   ON UPDATE CASCADE,
    ADD CONSTRAINT "TransportTrip_constSiteId_fkey"
        FOREIGN KEY ("constSiteId") REFERENCES "ConstSite"("id") ON DELETE RESTRICT   ON UPDATE CASCADE,
    ADD CONSTRAINT "TransportTrip_planningId_fkey"
        FOREIGN KEY ("planningId")  REFERENCES "Planning"("id")  ON DELETE SET NULL   ON UPDATE CASCADE,
    ADD CONSTRAINT "TransportTrip_materialId_fkey"
        FOREIGN KEY ("materialId")  REFERENCES "Material"("id")  ON DELETE SET NULL   ON UPDATE CASCADE;

ALTER TABLE "TransportDeparture"
    ADD CONSTRAINT "TransportDeparture_tripId_fkey"
        FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id")  ON DELETE CASCADE    ON UPDATE CASCADE;

ALTER TABLE "TransportArrival"
    ADD CONSTRAINT "TransportArrival_tripId_fkey"
        FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id")  ON DELETE CASCADE    ON UPDATE CASCADE;

-- =============================================================================
-- 10. TransportLog se mantiene SIN BORRAR para permitir rollback en esta release.
--     Eliminar en la siguiente migración cuando todo esté validado.
--
-- VERIFICACIONES POST-MIGRACIÓN (ejecutar manualmente):
--
--   SELECT count(*) FROM "TransportLog";                              -- total original
--   SELECT count(*) FROM "TransportTrip";                            -- debe igualar
--   SELECT count(*) FROM "TransportDeparture";                       -- debe igualar
--   SELECT count(*) FROM "TransportArrival";                         -- <= total
--
--   SELECT count(*) FROM "TransportLog" WHERE "arrivalAt" IS NOT NULL;
--   SELECT count(*) FROM "TransportArrival";                         -- >= anterior
--
--   SELECT SUM("departureM3") FROM "TransportLog";
--   SELECT SUM("m3") FROM "TransportDeparture";                      -- deben coincidir
-- =============================================================================
