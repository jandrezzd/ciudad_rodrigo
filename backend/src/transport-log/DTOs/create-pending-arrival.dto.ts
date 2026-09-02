import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Alta manual de una llegada huérfana desde el portal web, para reponer un
 * registro que se perdió (el supervisor de obra olvidó registrarla, o el
 * celular se dañó antes de sincronizar).
 *
 * No pide fotos a propósito: cuando alguien repone esto, el camión ya descargó
 * hace días y las fotos no existen. Queda marcada con source = MIGRATED para
 * poder distinguirla en los reportes de una capturada en campo.
 */
export class CreatePendingArrivalDto {
  @Type(() => Number)
  @IsInt()
  vehicleId!: number;

  /** Momento real de la llegada. Sin esto el registro es inservible: el
   *  emparejamiento se decide por la diferencia de tiempo con la salida. */
  @IsDateString()
  capturedAt!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  m3!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  m3Corrected?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  abscisa?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  almuerzo?: boolean;

  /** Por qué se está reponiendo a mano. Se guarda en observation. */
  @IsString()
  @MinLength(3)
  reason!: string;
}
