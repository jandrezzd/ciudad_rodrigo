import { BusinessException } from '../common/business.exception';

/** Para el `include` de un viaje: la liquidación en la que está, si hay. */
export const SELECT_LIQUIDACION_DEL_VIAJE = {
  select: { liquidacion: { select: { codigo: true } } },
} as const;

/**
 * Un viaje liquidado no se puede desemparejar, cambiar de planificación,
 * cancelar ni corregir sus m³: la liquidación quedaría apuntando a un viaje
 * sin llegada, de otra obra o con otros m³. Primero hay que quitarlo de la
 * liquidación (editándola o anulándola). Una liquidación anulada ya no tiene
 * filas en LiquidacionViaje, así que sus viajes no quedan bloqueados.
 */
export function asegurarNoLiquidado(trip: {
  liquidacionViaje?: { liquidacion: { codigo: string } } | null;
}) {
  const codigo = trip.liquidacionViaje?.liquidacion.codigo;
  if (codigo) {
    throw new BusinessException(
      'VIAJE_LIQUIDADO',
      `EL VIAJE ESTÁ EN LA LIQUIDACIÓN ${codigo}; QUÍTELO DE LA LIQUIDACIÓN ANTES.`,
      false,
      400,
    );
  }
}
