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

  /**
   * Requerido solo si NO viene `ordenItemId`: cuando el despacho pertenece a
   * una orden, el material se deriva de esa línea, no de este campo — mismo
   * criterio que ya rige `comprador`, cuyo nombre tampoco lo pone la app.
   */
  @IsOptional()
  @IsNumberString()
  materialId?: string;

  @IsNumberString()
  m3: string;

  /**
   * Línea de la orden que descuenta este despacho. Opcional por ahora: la app
   * todavía no sabe enviarlo. Cuando llega, se valida en firme — si la orden ya
   * se cerró, se completó, o no alcanza el cupo, la venta se rechaza entera en
   * vez de registrarse sin vincular (a diferencia del vehículo).
   */
  @IsOptional()
  @IsNumberString()
  ordenItemId?: string;

  /**
   * Cliente al que se le vendió, elegido de la lista del catálogo. Obligatorio:
   * una venta sin constancia de a quién se le vendió no sirve para nada.
   *
   * Solo viaja el id. El nombre lo escribe el servidor desde el cliente, así que
   * no hay forma de que el teléfono guarde un nombre que no corresponda.
   */
  @IsNumberString()
  compradorId: string;

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
