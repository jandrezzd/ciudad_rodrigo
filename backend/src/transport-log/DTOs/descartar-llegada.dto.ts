import { IsString, MinLength } from 'class-validator';

export class DescartarLlegadaDto {
  // Queda anexado a observation: es la única auditoría de la acción.
  @IsString()
  @MinLength(3)
  reason!: string;
}
