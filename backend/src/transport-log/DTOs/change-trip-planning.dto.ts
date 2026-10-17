import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/** Corrige la planificación de un viaje registrado en la equivocada. */
export class ChangeTripPlanningDto {
  @Type(() => Number)
  @IsInt()
  planningId!: number;

  /** Cantera de la nueva planificación. Si no viene, se resuelve sola
   *  (la del vehículo en esa planificación, o la única que tenga). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  canteraId?: number;

  // Queda en observation con usuario y fecha, igual que la reasignación.
  @IsString()
  @MinLength(3)
  reason!: string;
}
