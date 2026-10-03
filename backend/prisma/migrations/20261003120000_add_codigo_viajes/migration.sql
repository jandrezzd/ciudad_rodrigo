-- AlterTable
ALTER TABLE "TransportTrip" ADD COLUMN "codigo" TEXT;
ALTER TABLE "VentaCantera" ADD COLUMN "codigo" TEXT;

-- CreateTable
CREATE TABLE "TransportTripSequence" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransportTripSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VentaCanteraSequence" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VentaCanteraSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportTrip_codigo_key" ON "TransportTrip"("codigo");
CREATE UNIQUE INDEX "VentaCantera_codigo_key" ON "VentaCantera"("codigo");
CREATE UNIQUE INDEX "TransportTripSequence_year_key" ON "TransportTripSequence"("year");
CREATE UNIQUE INDEX "VentaCanteraSequence_year_key" ON "VentaCanteraSequence"("year");

-- Numeración de los registros existentes: correlativo por año (hora de
-- Ecuador) en orden de fecha real, y cada contador queda en el máximo.
WITH numerados AS (
    SELECT id,
           EXTRACT(YEAR FROM ("departureAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil'))::int AS anio,
           ROW_NUMBER() OVER (
               PARTITION BY EXTRACT(YEAR FROM ("departureAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil'))
               ORDER BY "departureAt", id
           ) AS n
    FROM "TransportTrip"
    WHERE "codigo" IS NULL
)
UPDATE "TransportTrip" t
SET "codigo" = 'TRA-' || LPAD(numerados.n::text, 5, '0') || '-' || numerados.anio
FROM numerados
WHERE t.id = numerados.id;

INSERT INTO "TransportTripSequence" ("year", "last")
SELECT EXTRACT(YEAR FROM ("departureAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil'))::int, COUNT(*)
FROM "TransportTrip"
GROUP BY 1
ON CONFLICT ("year") DO UPDATE SET "last" = GREATEST("TransportTripSequence"."last", EXCLUDED."last");

WITH numerados AS (
    SELECT id,
           EXTRACT(YEAR FROM ("capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil'))::int AS anio,
           ROW_NUMBER() OVER (
               PARTITION BY EXTRACT(YEAR FROM ("capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil'))
               ORDER BY "capturedAt", id
           ) AS n
    FROM "VentaCantera"
    WHERE "codigo" IS NULL
)
UPDATE "VentaCantera" v
SET "codigo" = 'VEN-' || LPAD(numerados.n::text, 5, '0') || '-' || numerados.anio
FROM numerados
WHERE v.id = numerados.id;

INSERT INTO "VentaCanteraSequence" ("year", "last")
SELECT EXTRACT(YEAR FROM ("capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil'))::int, COUNT(*)
FROM "VentaCantera"
GROUP BY 1
ON CONFLICT ("year") DO UPDATE SET "last" = GREATEST("VentaCanteraSequence"."last", EXCLUDED."last");
