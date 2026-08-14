import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/** Cantera desde la que despacha un vehículo dentro de una planificación */
export class VehicleCanteraDto {
  @IsInt()
  @Type(() => Number)
  vehicleId: number;

  /** null = sin cantera asignada todavía */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  canteraId?: number | null;
}

/**
 * El formulario viaja como multipart (por el PDF de factura), así que un arreglo
 * de objetos llega serializado como JSON. Acepta ambas formas.
 */
export const parseVehicleCanteras = (value: unknown): VehicleCanteraDto[] => {
  if (value == null || value === '') return [];

  let bruto: unknown = value;
  if (typeof value === 'string') {
    try {
      bruto = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(bruto)) return [];

  return bruto
    .map((item: any) => ({
      vehicleId: Number(item?.vehicleId),
      canteraId:
        item?.canteraId == null || item.canteraId === ''
          ? null
          : Number(item.canteraId),
    }))
    .filter((item) => Number.isInteger(item.vehicleId));
};
