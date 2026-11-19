import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { FECHA, MENSAJE_FECHA } from './fecha';

/** Filtros de GET /liquidaciones (historial). Las fechas son las de la liquidación. */
export class ListarLiquidacionesDto {
  @IsOptional()
  @Matches(FECHA, { message: `desde ${MENSAJE_FECHA}` })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: `hasta ${MENSAJE_FECHA}` })
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'constSiteId debe ser un número entero' })
  @Min(1)
  constSiteId?: number;

  /** Búsqueda parcial por código, sin distinguir mayúsculas ("0007", "liq-0007"). */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  codigo?: string;
}
