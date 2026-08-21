-- Aislada en su propia migración: Postgres no permite usar un valor de enum
-- recién agregado en la misma transacción en que se agrega.
ALTER TYPE "TransportStatus" ADD VALUE 'PENDIENTE_EMPAREJAMIENTO';
