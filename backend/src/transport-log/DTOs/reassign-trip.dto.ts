import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ReassignTripDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vehicleId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  driverId?: number;

  // Anexado a observation junto con usuario y timestamp: es la única
  // auditoría de esta acción en v1 (no hay tabla dedicada).
  @IsString()
  @MinLength(3)
  reason!: string;
}
