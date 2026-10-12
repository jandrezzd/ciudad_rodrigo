-- Registros de MEJORAMIENTO TIPO MOP y FILTRANTE 2 Y 4 en la tabla Material.
INSERT INTO "Material" ("materialType", "createdAt", "updatedAt")
VALUES
  ('MEJORAMIENTO_TIPO_MOP', NOW(), NOW()),
  ('FILTRANTE_2_4', NOW(), NOW())
ON CONFLICT ("materialType") DO NOTHING;
