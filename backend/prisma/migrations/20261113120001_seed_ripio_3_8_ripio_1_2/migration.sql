-- Registros de RIPIO 3/8 y RIPIO 1/2 en la tabla Material.
INSERT INTO "Material" ("materialType", "createdAt", "updatedAt")
VALUES
  ('RIPIO_3_8', NOW(), NOW()),
  ('RIPIO_1_2', NOW(), NOW())
ON CONFLICT ("materialType") DO NOTHING;
