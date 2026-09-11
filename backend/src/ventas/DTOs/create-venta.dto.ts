import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumberString,
  IsUUID,
  IsISO8601,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { emptyStringToNull } from '../../common/transformers';

/**
 * Envío de una venta desde la app. Llega como multipart, así que todo campo
 * numérico viaja como string — mismo criterio que SubmitDepartureDto.
 *
 * El ValidationPipe global corre con forbidNonWhitelisted: cualquier campo que
 * la app mande y no esté declarado aquí hace fallar el request entero.
 */
export class CreateVentaDto {
  /**
   * Idempotencia. Lo genera la app AL ABRIR el formulario, no al enviarlo: dos
   * toques comparten uuid y el servidor resuelve el segundo como reenvío en
   * lugar de crear un registro duplicado.
   */
  @IsUUID('4')
  uuid: string;

  /** Hora real del despacho (reloj del teléfono ya corregido por la app). */
  @IsISO8601()
  capturedAt: string;

  /** QR de la cantera escaneado. El servidor deduce de aquí la cantera. */
  @IsString()
  @IsNotEmpty()
  qrcode: string;

  /**
   * ID del vehículo tal como lo tecleó el supervisor. Puede no existir en el
   * catálogo (externo recién dado de alta): la venta se registra igual y queda
   * marcada para que un ADMIN la complete desde la web.
   */
  @IsString()
  @IsNotEmpty()
  vehicleIdText: string;

  @IsNumberString()
  materialId: string;

  @IsNumberString()
  m3: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  comprador?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  observation?: string;

  @IsOptional()
  @IsNumberString()
  lat?: string;

  @IsOptional()
  @IsNumberString()
  lng?: string;
}
