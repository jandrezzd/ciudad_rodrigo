-- Calibración del emparejamiento salida<->llegada.
--
-- Consultas de SOLO LECTURA. Se corren contra la base de producción ANTES de
-- activar el algoritmo por menor diferencia de tiempo, para fijar las constantes
-- con datos reales del negocio en vez de valores supuestos.
--
-- Uso:  psql "$DATABASE_URL" -f backend/prisma/scripts/calibracion-emparejamiento.sql
--
-- Ninguna consulta escribe. Se pueden correr en horario laboral sin riesgo.


\echo '=== 1. Distribución real del gap salida->llegada (minutos) ==='
-- Sobre viajes YA cerrados, que tienen salida y llegada reales.
-- Fija OPEN_TRIP_ATTENTION_HOURS <- p99 redondeado hacia arriba: es el tiempo
-- tras el cual una salida sin llegada deja de ser "normal" y pasa a merecer
-- atención. El valor de partida del plan (24 h) se confirma o se corrige acá.
SELECT
  count(*)                                                        AS viajes,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY gap_min)::numeric, 1) AS p50,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY gap_min)::numeric, 1) AS p90,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY gap_min)::numeric, 1) AS p95,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY gap_min)::numeric, 1) AS p99,
  round(max(gap_min)::numeric, 1)                                 AS maximo,
  round((percentile_cont(0.99) WITHIN GROUP (ORDER BY gap_min) / 60)::numeric, 1)
                                                                  AS p99_horas
FROM (
  SELECT EXTRACT(EPOCH FROM (a."capturedAt" - d."capturedAt")) / 60 AS gap_min
  FROM "TransportTrip" t
  JOIN "TransportDeparture" d ON d."tripId" = t.id
  JOIN "TransportArrival"   a ON a."tripId" = t.id
  WHERE a."capturedAt" > d."capturedAt"
) s;


\echo ''
\echo '=== 2. Separación entre salidas consecutivas del mismo vehículo (minutos) ==='
-- Doble propósito:
--   a) TIE_MARGIN_MIN debe quedar por DEBAJO del p01. Si dos salidas legítimas
--      del mismo vehículo nunca se acercan a menos de N min, un margen de
--      empate menor a N nunca bloquea un emparejamiento válido.
--   b) Valida DUPLICATE_GUARD_MIN (10 min del plan). Si hay una masa real de
--      pares por debajo de 10 min, ese guard bloquearía trabajo legítimo y hay
--      que bajarlo. Es la única forma de saberlo sin romper nada en producción.
SELECT
  count(*)                                                          AS pares,
  round(min(delta_min)::numeric, 1)                                 AS minimo,
  round(percentile_cont(0.01) WITHIN GROUP (ORDER BY delta_min)::numeric, 1) AS p01,
  round(percentile_cont(0.05) WITHIN GROUP (ORDER BY delta_min)::numeric, 1) AS p05,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY delta_min)::numeric, 1) AS p50
FROM (
  SELECT EXTRACT(EPOCH FROM (
           "departureAt" - LAG("departureAt")
             OVER (PARTITION BY "vehicleId" ORDER BY "departureAt")
         )) / 60 AS delta_min
  FROM "TransportTrip"
) s
WHERE delta_min IS NOT NULL;


\echo ''
\echo '=== 2b. Cuántos pares caerían bajo el guard anti-duplicado ==='
-- Si "menos_de_10min" es alto y esos pares son vueltas reales, DUPLICATE_GUARD_MIN
-- debe bajar. Si son casi todos duplicados (mismo m³, misma foto), confirma el guard.
SELECT
  count(*) FILTER (WHERE delta_min < 2)  AS menos_de_2min,
  count(*) FILTER (WHERE delta_min < 5)  AS menos_de_5min,
  count(*) FILTER (WHERE delta_min < 10) AS menos_de_10min,
  count(*) FILTER (WHERE delta_min < 30) AS menos_de_30min,
  count(*)                               AS total_pares
FROM (
  SELECT EXTRACT(EPOCH FROM (
           "departureAt" - LAG("departureAt")
             OVER (PARTITION BY "vehicleId" ORDER BY "departureAt")
         )) / 60 AS delta_min
  FROM "TransportTrip"
) s
WHERE delta_min IS NOT NULL;


\echo ''
\echo '=== 3. Salidas sospechosas de ser duplicado (mismo vehículo, <10 min, mismo m3) ==='
-- Inventario del daño ya existente. Estas son las que habría que revisar a mano.
SELECT
  v.plate, v.vehicleid,
  t1.id AS trip_a, t1."departureAt" AS salida_a, t1.status AS estado_a,
  t2.id AS trip_b, t2."departureAt" AS salida_b, t2.status AS estado_b,
  round(EXTRACT(EPOCH FROM (t2."departureAt" - t1."departureAt"))::numeric / 60, 1) AS delta_min,
  d1.m3 AS m3_a, d2.m3 AS m3_b
FROM "TransportTrip" t1
JOIN "TransportTrip" t2
  ON t2."vehicleId" = t1."vehicleId"
 AND t2.id <> t1.id
 AND t2."departureAt" > t1."departureAt"
 AND t2."departureAt" < t1."departureAt" + INTERVAL '10 minutes'
JOIN "TransportDeparture" d1 ON d1."tripId" = t1.id
JOIN "TransportDeparture" d2 ON d2."tripId" = t2.id
JOIN "Vehicle" v ON v.id = t1."vehicleId"
ORDER BY t1."departureAt" DESC
LIMIT 50;


\echo ''
\echo '=== 4. Llegadas huérfanas cuyo clientUuid YA existe como TransportArrival ==='
-- Esta es la causa P2002 del error 500 en manual-match: la misma llegada quedó
-- copiada en las dos tablas. Si esta consulta devuelve filas, esas pendientes son
-- inemparejables y hay que descartarlas (no emparejarlas).
SELECT
  p.id AS pending_id, p.status, p."capturedAt", p."clientUuid",
  a.id AS arrival_id, a."tripId" AS ya_emparejada_en_viaje,
  v.plate, v.vehicleid
FROM "TransportArrivalPending" p
JOIN "TransportArrival" a ON a."clientUuid" = p."clientUuid"
JOIN "Vehicle" v ON v.id = p."vehicleId"
WHERE p.status <> 'EMPAREJADO'
ORDER BY p."capturedAt" DESC;


\echo ''
\echo '=== 4b. Diagnóstico de un vehículo puntual (ajustar placa y fecha) ==='
-- Caso que originó todo esto: GTY2083 / TCR-02-62 el 31/08/2026 — 1 salida y
-- 2 llegadas, con 500 al emparejar. Cambiar la placa para revisar otro.
\set placa '\'GTY2083\''
\set desde '\'2026-08-28\''

SELECT
  t.id, t.status, t."departureAt", t."arrivalAt",
  d.id AS dep_id, round(d.m3::numeric, 2) AS m3_salida,
  a.id AS arr_id, round(a.m3::numeric, 2) AS m3_llegada
FROM "TransportTrip" t
LEFT JOIN "TransportDeparture" d ON d."tripId" = t.id
LEFT JOIN "TransportArrival"   a ON a."tripId" = t.id
WHERE t."vehicleId" = (SELECT id FROM "Vehicle" WHERE plate = :placa)
  AND t."departureAt" >= :desde
ORDER BY t."departureAt";

SELECT
  p.id, p.status, p."capturedAt", round(p.m3::numeric, 2) AS m3, p."matchedTripId",
  (SELECT a.id FROM "TransportArrival" a WHERE a."clientUuid" = p."clientUuid")
    AS arrival_con_mismo_uuid   -- si NO es null: esta pendiente es inemparejable
FROM "TransportArrivalPending" p
WHERE p."vehicleId" = (SELECT id FROM "Vehicle" WHERE plate = :placa)
  AND p."capturedAt" >= :desde
ORDER BY p."capturedAt";


\echo ''
\echo '=== 5. Viajes que el barrido nunca podrá emparejar (sin tiempoPromedioViajeMin) ==='
-- Con el algoritmo de ventana actual, estos hacen `continue` y quedan
-- EN_PROGRESO para siempre. El algoritmo por menor gap los rescata.
SELECT
  count(*) AS viajes_sin_tiempo_promedio,
  min(t."departureAt") AS mas_antiguo
FROM "TransportTrip" t
LEFT JOIN "Planning" pl ON pl.id = t."planningId"
WHERE t.status IN ('EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO')
  AND pl."tiempoPromedioViajeMin" IS NULL;
