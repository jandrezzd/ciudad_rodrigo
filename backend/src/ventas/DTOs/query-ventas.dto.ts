import { IsOptional, IsInt, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';

/** Filtros de la grilla web. Todos opcionales: sin filtros devuelve todo. */
export class QueryVentasDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  canteraId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vehicleId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  materialId?: number;

  /** Ambas se comparan contra capturedAt: la hora del despacho, no la de sincronización. */
  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;
}
