import { IsString, MinLength } from 'class-validator';

export class UnmatchTripDto {
  // Anexado a observation junto con usuario y timestamp, mismo formato que
  // ReassignTripDto: es la única auditoría de esta acción (no hay tabla
  // dedicada). Deshacer un emparejamiento borra una llegada y reabre un viaje
  // ya cerrado, así que el motivo no es opcional.
  @IsString()
  @MinLength(3)
  reason!: string;
}
