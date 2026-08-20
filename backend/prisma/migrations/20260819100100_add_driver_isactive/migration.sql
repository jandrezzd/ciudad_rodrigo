-- Replica el patrón de baja lógica ya usado por Vehicle/Owner/Client/Cantera/MaterialProvider.
ALTER TABLE "Driver" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
