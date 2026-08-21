-- Catálogo de materiales: deduplicar, blindar con UNIQUE y cargar los nuevos.
--
-- Contexto: el seed original hacía un create() por cada valor del enum sin
-- restricción de unicidad, así que una base sembrada dos veces puede tener el
-- mismo materialType repetido. Antes de poder insertar por diferencia hay que
-- dejar una sola fila por tipo.

-- 1. Repuntar las FKs de las filas duplicadas hacia la fila que se conserva
--    (la de menor id). Sin esto el DELETE de abajo fallaría por FK.
WITH canonico AS (
  SELECT id, "materialType", MIN(id) OVER (PARTITION BY "materialType") AS id_final
  FROM "Material"
)
UPDATE "TransportTrip" t
SET "materialId" = c.id_final
FROM canonico c
WHERE t."materialId" = c.id AND c.id <> c.id_final;

WITH canonico AS (
  SELECT id, "materialType", MIN(id) OVER (PARTITION BY "materialType") AS id_final
  FROM "Material"
)
UPDATE "CanteraMaterial" cm
SET "materialId" = c.id_final
FROM canonico c
WHERE cm."materialId" = c.id AND c.id <> c.id_final;

-- 2. Borrar los duplicados ya sin referencias.
DELETE FROM "Material" m
WHERE m.id > (SELECT MIN(m2.id) FROM "Material" m2 WHERE m2."materialType" = m."materialType");

-- 3. Impedir que vuelvan a aparecer. Además habilita upsert por materialType.
CREATE UNIQUE INDEX IF NOT EXISTS "Material_materialType_key" ON "Material"("materialType");

-- 4. Cargar los materiales que falten. ON CONFLICT DO NOTHING deja intactos los
--    existentes, así que conservan su id y no se rompe ningún viaje histórico.
INSERT INTO "Material" ("materialType", "createdAt", "updatedAt")
SELECT v.tipo::"MaterialType", NOW(), NOW()
FROM (VALUES
  ('ARENA_DE_BANCO'),
  ('ARENA_DE_MAR'),
  ('ARENA_DE_PLAYA'),
  ('ARENA_DE_RIO'),
  ('ARENA_DE_RIO_COLIMES'),
  ('ARENA_FINA'),
  ('ARENA_FINA_LAVADA'),
  ('ARENA_HOMOGENIZADA'),
  ('ARENA_LAVADA'),
  ('ARENA_LISTA_PARA_HORMIGON'),
  ('BASALTO_SAN_CARLOS'),
  ('BASALTO_SIN_CLASIFICAR'),
  ('BASE'),
  ('BASE_CEMENTO'),
  ('BASE_CIUDAD_RODRIGO'),
  ('BASE_CLASE_1_A'),
  ('CASCAJO'),
  ('CASCAJO_CRIBADO'),
  ('CISCO'),
  ('CISCO_CRUDO'),
  ('CISCO_LAVADO'),
  ('CISCO_P_TUBERIA'),
  ('CRUDO'),
  ('ESCOMBROS'),
  ('FRESADO'),
  ('LASTRE'),
  ('MAT_TRITURADO_PARA_RIPIO'),
  ('MATERIAL_DE_MEJORAMIENTO'),
  ('MEJORAMIENTO'),
  ('MEJORAMIENTO_CRIBADO'),
  ('MEJORAMIENTO_MTOP'),
  ('MEJORAMIENTO_S_C'),
  ('MEZCLA_ASFALTICA'),
  ('P_BOLON'),
  ('PIEDRA_6'),
  ('PIEDRA_67'),
  ('PIEDRA_7'),
  ('PIEDRA_6_LAVADA'),
  ('PIEDRA_8_3_8'),
  ('PIEDRA_1_2_VSI'),
  ('PIEDRA_2_4'),
  ('PIEDRA_3_4'),
  ('PIEDRA_3_8_VSI'),
  ('PIEDRA_4_19_38_MM'),
  ('PIEDRA_7_8'),
  ('PIEDRA_BASE'),
  ('PIEDRA_BLANCA'),
  ('PIEDRA_BOLA'),
  ('PIEDRA_BOLA_BANCO'),
  ('PIEDRA_BOLA_SELECCIONADA'),
  ('PIEDRA_BOLON'),
  ('PIEDRA_DEFENSA'),
  ('PIEDRA_ESCOLLERA'),
  ('PIEDRA_FILTRANTE'),
  ('PIEDRA_FILTRANTE_CAFE'),
  ('PIEDRA_HOMO_57'),
  ('PIEDRA_TRANSICION'),
  ('PIEDRAPLEN'),
  ('PRESTAMO_IMPORTADO'),
  ('RIPIO'),
  ('ROCARENA'),
  ('SUB_BASE'),
  ('SUB_BASE_CLASE_3'),
  ('TRITURADO_4_10')
) AS v(tipo)
ON CONFLICT ("materialType") DO NOTHING;
