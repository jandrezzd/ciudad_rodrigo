import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/** Carga material en un punto de venta: suma a lo asignado. */
export class IngresoStockDto {
  @Type(() => Number)
  @IsInt()
  canteraId: number;

  @Type(() => Number)
  @IsInt()
  materialId: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'LA CANTIDAD DEL INGRESO DEBE SER MAYOR A CERO' })
  m3: number;

  @IsOptional()
  @IsString()
  motivo?: string;
}

/**
 * Corrección manual de la cantidad asignada. El motivo es obligatorio: un saldo
 * que cambia sin explicación no se distingue de un error de carga.
 */
export class AjusteStockDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'LA CANTIDAD ASIGNADA NO PUEDE SER NEGATIVA' })
  m3Asignados: number;

  @IsString()
  @MinLength(3, { message: 'INDIQUE EL MOTIVO DEL AJUSTE' })
  motivo: string;
}
