-- Agrega PIEDRA 30/70 y BASE HIDRATADA al enum MaterialType.
-- El INSERT va en la migración siguiente: Postgres no deja usar un valor de
-- enum en la misma transacción que lo agregó.
ALTER TYPE "MaterialType" ADD VALUE IF NOT EXISTS 'PIEDRA_30_70';
ALTER TYPE "MaterialType" ADD VALUE IF NOT EXISTS 'BASE_HIDRATADA';
