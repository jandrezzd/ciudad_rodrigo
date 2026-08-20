-- Campos nuevos de Planning para el emparejamiento de viajes por ventana de tiempo.
-- distanciaAproximadaKm es solo informativo (no se usa en el cálculo).
-- tiempoPromedioViajeMin es el único campo que usa el algoritmo de reconciliación.
ALTER TABLE "Planning" ADD COLUMN "distanciaAproximadaKm" DOUBLE PRECISION;
ALTER TABLE "Planning" ADD COLUMN "tiempoPromedioViajeMin" INTEGER;
