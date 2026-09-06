import { IsInt, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ConversionDireccion } from '@prisma/client';

/**
 * Material que despacha una cantera, con la cantidad asignada.
 * `toneladas` y `metrosCubicos` son el stock inicial; el consumo se registra
 * aparte en el libro mayor (CanteraMaterialMovimiento).
 */
export class CanteraMaterialDto {
  @IsInt()
  @Type(() => Number)
  materialId: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  toneladas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  metrosCubicos?: number;

  /** M3 suelto calculado (metrosCubicos * factor), solo cuando direccionConversion es M3_A_M3 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  metrosCubicosSueltos?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  factor?: number;

  @IsOptional()
  @IsEnum(ConversionDireccion)
  direccionConversion?: ConversionDireccion;
}
