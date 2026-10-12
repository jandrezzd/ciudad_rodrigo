-- Agrega MEJORAMIENTO TIPO MOP y FILTRANTE 2 Y 4 al enum MaterialType.
-- El INSERT va en la migración siguiente: Postgres no deja usar un valor de
-- enum en la misma transacción que lo agregó.
ALTER TYPE "MaterialType" ADD VALUE IF NOT EXISTS 'MEJORAMIENTO_TIPO_MOP';
ALTER TYPE "MaterialType" ADD VALUE IF NOT EXISTS 'FILTRANTE_2_4';
