-- Agrega el valor ARENA_MICA al enum MaterialType.
-- IF NOT EXISTS: seguro de re-ejecutar si ya se agregó manualmente en la BD.
ALTER TYPE "MaterialType" ADD VALUE IF NOT EXISTS 'ARENA_MICA';
