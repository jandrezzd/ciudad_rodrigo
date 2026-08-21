import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumberString,
  IsInt,
  IsUUID,
  IsEnum,
  IsISO8601,
  IsBooleanString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitDepartureDto {
  // Idempotencia, generado en Room AL ABRIR el formulario (evita duplicados por doble-tap).
  // Opcional durante esta release (legacy): si no viene, se genera randomUUID() en el servidor.
  @IsOptional()
  @IsUUID('4')
  uuid?: string;

  // Hora real del operador. Opcional durante esta release (legacy): default new Date().
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  // Alternativa a vehicleId (resolución offline por QR).
  @IsOptional()
  @IsString()
  qrcode?: string;

  @IsOptional()
  @IsEnum(['ONLINE', 'OFFLINE'])
  source?: string;

  @IsOptional()
  @IsNumberString()
  vehicleId?: string;

  @IsOptional()
  @IsNumberString()
  planningId?: string;

  @IsOptional()
  @IsNumberString()
  clientId?: string;

  @IsOptional()
  @IsNumberString()
  constSiteId?: string;

  @IsNumberString()
  departureM3: string;

  @IsString()
  @IsNotEmpty()
  departureLat: string;

  @IsString()
  @IsNotEmpty()
  departureLng: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  materialId?: number;

  /**
   * Cantera de la que sale el material. Opcional: si no viene, el servidor la
   * deduce del vehículo en su planificación, o de la única cantera de esa
   * planificación.
   */
  @IsOptional()
  @IsNumberString()
  canteraId?: string;

  // Marcado por el supervisor de cantera si el chofer se fue a almorzar en
  // este viaje (1h fija, se descuenta al calcular la ventana de emparejamiento).
  @IsOptional()
  @IsBooleanString()
  almuerzo?: string;
}
