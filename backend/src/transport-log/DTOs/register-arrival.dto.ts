import { IsNumber, IsString, IsNumberString, IsNotEmpty, IsLatitude, IsLongitude, IsOptional, IsInt, IsUUID, IsISO8601 } from 'class-validator';

export class RegisterArrivalDto {
  // Idempotencia ante reintentos (doble clic, red inestable). Opcional: si no
  // viene, el servidor genera uno, que es el comportamiento histórico.
  // Sin declararlo acá el ValidationPipe global (forbidNonWhitelisted) rechaza
  // la petición con 400 en cuanto el cliente lo envía.
  @IsOptional()
  @IsUUID('4')
  uuid?: string;

  // Hora real de la llegada. Opcional: si no viene se usa la del servidor.
  // Necesario para reponer a mano una llegada de días atrás con su hora real,
  // que es lo que usa el emparejamiento por diferencia de tiempo.
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @IsNumberString()
  arrivalM3: string;

  @IsOptional()
  @IsNumberString()
  arrivalM3Corrected?: string;

  @IsOptional()
  @IsString()
  abscisa?: string;

  @IsOptional()
  @IsString()
  arrivalDriverPhoto?: string;

  @IsOptional()
  @IsString()
  arrivalVehiclePhoto?: string;

  @IsOptional()
  @IsString()
  arrivalPlatePhoto?: string;

  @IsOptional()
  @IsString()
  arrivalMaterialPhoto1?: string;

  @IsOptional()
  @IsString()
  arrivalMaterialPhoto2?: string;

  @IsNumberString()
  arrivalLat: string;

  @IsNumberString()
  arrivalLng: string;

  @IsOptional()
  @IsNumberString()
  departureM3Corrected?: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @IsInt()
  materialId?: number;
}
