import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FECHA, MENSAJE_FECHA } from './fecha';

/** Un viaje y el precio que se le asigna en la liquidación. */
export class ViajePrecioDto {
  @IsInt({ message: 'tripId debe ser un número entero' })
  @Min(1)
  tripId: number;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número con 2 decimales como máximo' },
  )
  @IsPositive({ message: 'El precio debe ser mayor que 0' })
  @Max(1_000_000, { message: 'El precio no puede superar 1.000.000' })
  precio: number;
}

/** Body de POST /liquidaciones. El total lo calcula el servidor. */
export class CrearLiquidacionDto {
  @IsInt({ message: 'constSiteId debe ser un número entero' })
  @Min(1)
  constSiteId: number;

  @IsInt({ message: 'clientId debe ser un número entero' })
  @Min(1)
  clientId: number;

  /** Día de la liquidación; si no viene, hoy (hora de Ecuador). */
  @IsOptional()
  @Matches(FECHA, { message: `fecha ${MENSAJE_FECHA}` })
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La observación admite hasta 500 caracteres' })
  observacion?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La liquidación debe tener al menos un viaje' })
  @ArrayMaxSize(1000, { message: 'Una liquidación admite hasta 1000 viajes' })
  @ValidateNested({ each: true })
  @Type(() => ViajePrecioDto)
  viajes: ViajePrecioDto[];
}
