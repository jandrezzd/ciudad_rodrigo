import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';
import { FECHA, MENSAJE_FECHA } from './fecha';

/**
 * Filtros de GET /liquidaciones/viajes. Con `desde` y/o `hasta` se devuelven
 * todos los viajes del rango; sin fechas, como máximo los 500 más recientes.
 */
export class ListarViajesLiquidablesDto {
  /** Día de inicio (AAAA-MM-DD), hora de Ecuador. Salida o llegada en el rango. */
  @IsOptional()
  @Matches(FECHA, { message: `desde ${MENSAJE_FECHA}` })
  desde?: string;

  /** Día de fin (AAAA-MM-DD), incluido completo, hora de Ecuador. */
  @IsOptional()
  @Matches(FECHA, { message: `hasta ${MENSAJE_FECHA}` })
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'constSiteId debe ser un número entero' })
  @Min(1)
  constSiteId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'clientId debe ser un número entero' })
  @Min(1)
  clientId?: number;
}
