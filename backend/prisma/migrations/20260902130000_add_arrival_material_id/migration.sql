-- Material elegido por el supervisor de obra al registrar la llegada.
--
-- Independiente de TransportTrip.materialId (fijado en la salida por la
-- cantera): esta columna es solo una señal de auditoría, no se usa en ninguna
-- validación ni en el emparejamiento. Un desajuste entre los dos indica que la
-- llegada se emparejó con la salida equivocada.
--
-- Nullable en ambas tablas: aditivo, no rompe filas existentes ni el flujo si
-- el cliente no lo envía.

ALTER TABLE "TransportArrival" ADD COLUMN "materialId" INTEGER;

ALTER TABLE "TransportArrival"
    ADD CONSTRAINT "TransportArrival_materialId_fkey"
        FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TransportArrivalPending" ADD COLUMN "materialId" INTEGER;

ALTER TABLE "TransportArrivalPending"
    ADD CONSTRAINT "TransportArrivalPending_materialId_fkey"
        FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
