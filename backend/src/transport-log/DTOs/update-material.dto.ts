import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Corrección del material de un viaje ya registrado.
 *
 * Solo el material: los m³ se corrigen por `correct-material` (que pese al
 * nombre corrige cantidades) y el vehículo por `reassign`.
 */
export class UpdateMaterialDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  materialId: number;
}
