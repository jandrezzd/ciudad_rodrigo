import type { VentaCantera } from '../types';

/**
 * ID del catálogo (VI-003, TE-00012...). `vehicleIdText` no sirve aquí: es lo
 * que tecleó el supervisor, y la app hoy envía la placa. Sin vehículo
 * vinculado no hay ID que mostrar.
 */
export const idVehiculoVenta = (venta: VentaCantera): string =>
  venta.vehicle?.vehicleid ?? '—';

/**
 * La del vehículo vinculado; si no está en el catálogo, la que se tecleó. Las
 * placas van sin guion: un texto con guion es un ID interno de las ventas
 * viejas (VI-003), no una placa.
 */
export const placaVehiculoVenta = (venta: VentaCantera): string => {
  const placa = venta.plate ?? venta.vehicle?.plate;
  if (placa) return placa;
  const texto = venta.vehicleIdText?.trim() ?? '';
  return texto && !texto.includes('-') ? texto.toUpperCase() : '—';
};
