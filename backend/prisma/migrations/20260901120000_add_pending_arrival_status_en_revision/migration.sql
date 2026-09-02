-- Estado de una llegada liberada al desemparejar un viaje desde el portal web.
--
-- Existe para que el emparejamiento automático NO la vuelva a tomar: el barrido
-- periódico solo busca status = 'PENDIENTE', así que una llegada en EN_REVISION
-- queda esperando la decisión del ADMIN. Sin esto, el cron de 5 minutos rehace
-- exactamente el mismo par que el ADMIN acaba de deshacer.
--
-- Aislada en su propia migración: Postgres no permite usar un valor de enum
-- recién agregado en la misma transacción en que se agrega.
ALTER TYPE "PendingArrivalStatus" ADD VALUE 'EN_REVISION';
