-- Checklist de almuerzo (1h fija, opcional). Marcable por cualquiera de los dos
-- supervisores; TransportTrip.almuerzoAplicado es el espejo usado por el
-- algoritmo de reconciliación para descontar la hora del tiempo esperado.
ALTER TABLE "TransportDeparture" ADD COLUMN "almuerzo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TransportArrival" ADD COLUMN "almuerzo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TransportTrip" ADD COLUMN "almuerzoAplicado" BOOLEAN NOT NULL DEFAULT false;
