-- Inserta el registro de ARENA_MICA en la tabla Material.
-- ON CONFLICT DO NOTHING: seguro de re-ejecutar si ya existe la fila.
INSERT INTO "Material" ("materialType", "createdAt", "updatedAt")
VALUES ('ARENA_MICA', NOW(), NOW())
ON CONFLICT ("materialType") DO NOTHING;
