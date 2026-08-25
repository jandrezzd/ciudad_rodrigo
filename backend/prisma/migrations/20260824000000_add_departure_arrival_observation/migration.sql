-- Observación escrita por el supervisor de cantera al registrar la salida.
ALTER TABLE "TransportDeparture" ADD COLUMN "observation" TEXT;

-- Observación escrita por el supervisor de obra al registrar la llegada.
ALTER TABLE "TransportArrival" ADD COLUMN "observation" TEXT;

-- Misma observación de obra, pero para llegadas que sincronizaron en
-- staging (sin salida emparejada todavía).
ALTER TABLE "TransportArrivalPending" ADD COLUMN "observation" TEXT;
