import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumberString,
  IsUUID,
  IsIn,
  IsISO8601,
  IsBooleanString,
} from 'class-validator';

export class SubmitArrivalDto {
  // Idempotencia, generado en Room al abrir el formulario.
  @IsUUID('4')
  uuid!: string;

  // QR del vehículo escaneado; el backend resuelve la salida a cerrar (ver 1.4).
  @IsOptional()
  @IsString()
  qrcode?: string;

  // Alias legacy: patch sobre /transport/:id/arrival puede enviar tripId en lugar de qrcode.
  @IsOptional()
  @IsNumberString()
  tripId?: string;

  // Uuid de la salida capturado por el cliente al escanear (== TransportTrip.uuid).
  // Permite resolver el viaje directamente en vez de inferirlo por vehicleId+fecha.
  @IsOptional()
  @IsUUID('4')
  departureUuid?: string;

  @IsISO8601()
  capturedAt!: string;

  @IsOptional()
  @IsIn(['ONLINE', 'OFFLINE'])
  source?: string;

  @IsNumberString()
  arrivalM3!: string;

  @IsOptional()
  @IsNumberString()
  arrivalM3Corrected?: string;

  @IsOptional()
  @IsString()
  abscisa?: string;

  @IsNumberString()
  arrivalLat!: string;

  @IsNumberString()
  arrivalLng!: string;

  @IsOptional()
  @IsNumberString()
  departureM3Corrected?: string;

  // Marcado por el supervisor de obra si el chofer se fue a almorzar en este
  // viaje (1h fija, se descuenta al calcular la ventana de emparejamiento).
  @IsOptional()
  @IsBooleanString()
  almuerzo?: string;

  // Observación escrita por el supervisor de obra al registrar la llegada.
  @IsOptional()
  @IsString()
  observation?: string;
}
