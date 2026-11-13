-- Agrega RIPIO 3/8 y RIPIO 1/2 al enum MaterialType.
-- El INSERT va en la migración siguiente: Postgres no deja usar un valor de
-- enum en la misma transacción que lo agregó.
ALTER TYPE "MaterialType" ADD VALUE IF NOT EXISTS 'RIPIO_3_8';
ALTER TYPE "MaterialType" ADD VALUE IF NOT EXISTS 'RIPIO_1_2';
