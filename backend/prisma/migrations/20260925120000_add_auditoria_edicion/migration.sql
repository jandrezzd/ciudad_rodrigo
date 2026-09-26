-- Auditoría: quién editó por última vez una orden de venta, quién emparejó
-- un viaje a mano (null = lo hizo el barrido automático) y quién corrigió el
-- material de un despacho. Solo la última acción, no un historial completo.

-- AlterTable
ALTER TABLE "VentaOrden" ADD COLUMN "editadoPorId" INTEGER;
ALTER TABLE "VentaOrden" ADD COLUMN "editadoEn" TIMESTAMP(3);
ALTER TABLE "VentaOrden" ADD CONSTRAINT "VentaOrden_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TransportTrip" ADD COLUMN "matchedAt" TIMESTAMP(3);
ALTER TABLE "TransportTrip" ADD COLUMN "matchedById" INTEGER;
ALTER TABLE "TransportTrip" ADD COLUMN "materialCorregidoPorId" INTEGER;
ALTER TABLE "TransportTrip" ADD COLUMN "materialCorregidoEn" TIMESTAMP(3);
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_materialCorregidoPorId_fkey" FOREIGN KEY ("materialCorregidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
