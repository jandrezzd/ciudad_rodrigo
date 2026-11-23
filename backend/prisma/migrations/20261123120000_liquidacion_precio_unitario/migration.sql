-- Liquidaciones: el precio de cada viaje pasa a ser un PRECIO UNITARIO por m³.
-- Subtotal del viaje = m³ de llegada por precio unitario,
-- y el montoTotal es la suma de los subtotales.

-- 1. Columnas nuevas (nullable mientras se llenan).
ALTER TABLE "LiquidacionViaje" ADD COLUMN "m3" DECIMAL(10,2),
ADD COLUMN "subtotal" DECIMAL(12,2);

-- 2. m³ de llegada de cada viaje liquidado y su subtotal.
UPDATE "LiquidacionViaje" lv
SET "m3" = ROUND(COALESCE(a."m3Corrected", a."m3")::numeric, 2)
FROM "TransportArrival" a
WHERE a."tripId" = lv."tripId";

-- Sin llegada no debería existir (solo se liquidan viajes emparejados).
UPDATE "LiquidacionViaje" SET "m3" = 0 WHERE "m3" IS NULL;

UPDATE "LiquidacionViaje" SET "subtotal" = ROUND("m3" * "precio", 2);

-- 3. Total de las liquidaciones con viajes (las ACTIVAS).
UPDATE "Liquidacion" l
SET "montoTotal" = s.total
FROM (
  SELECT "liquidacionId", SUM("subtotal") AS total
  FROM "LiquidacionViaje"
  GROUP BY "liquidacionId"
) s
WHERE s."liquidacionId" = l."id";

-- 4. ANULADAS: sus viajes viven en la foto `viajesAnulados`. Se agrega m3 y
-- subtotal a cada elemento y se recalcula el total desde la foto.
UPDATE "Liquidacion" l
SET "viajesAnulados" = f.foto,
    "montoTotal" = f.total
FROM (
  SELECT
    l2."id",
    jsonb_agg(
      e
        || jsonb_build_object(
          'm3', ROUND(COALESCE((e->>'m3Llegada')::numeric, 0), 2),
          'subtotal', ROUND(COALESCE((e->>'m3Llegada')::numeric, 0) * (e->>'precio')::numeric, 2)
        )
      ORDER BY o.idx
    ) AS foto,
    SUM(ROUND(COALESCE((e->>'m3Llegada')::numeric, 0) * (e->>'precio')::numeric, 2)) AS total
  FROM "Liquidacion" l2
  CROSS JOIN LATERAL jsonb_array_elements(l2."viajesAnulados") WITH ORDINALITY AS o(e, idx)
  WHERE l2."estado" = 'ANULADA'
    AND jsonb_typeof(l2."viajesAnulados") = 'array'
  GROUP BY l2."id"
) f
WHERE f."id" = l."id";

-- 5. Obligatorias de aquí en adelante.
ALTER TABLE "LiquidacionViaje" ALTER COLUMN "m3" SET NOT NULL,
ALTER COLUMN "subtotal" SET NOT NULL;
