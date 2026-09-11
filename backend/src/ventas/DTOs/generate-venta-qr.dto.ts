import { IsArray, IsInt, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Genera (o regenera) el QR de venta de una o varias canteras. Crear la fila es
 * lo que convierte a la cantera en punto de venta: no hay bandera aparte.
 */
export class GenerateVentaQrDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  canteraIds: number[];
}
