-- Registros de PIEDRA 30/70 y BASE HIDRATADA en la tabla Material.
INSERT INTO "Material" ("materialType", "createdAt", "updatedAt")
VALUES
  ('PIEDRA_30_70', NOW(), NOW()),
  ('BASE_HIDRATADA', NOW(), NOW())
ON CONFLICT ("materialType") DO NOTHING;
