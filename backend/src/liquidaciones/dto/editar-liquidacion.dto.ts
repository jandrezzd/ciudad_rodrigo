import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FECHA, MENSAJE_FECHA } from './fecha';
import { ViajePrecioDto } from './crear-liquidacion.dto';

/**
 * Body de PATCH /liquidaciones/:id. Solo se mandan los campos que cambian,
 * más el motivo (obligatorio). `viajes` es la lista FINAL: los viajes que
 * no vengan se quitan de la liquidación y vuelven a ser liquidables.
 */
export class EditarLiquidacionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El motivo es obligatorio' })
  @Length(5, 500, { message: 'El motivo debe tener entre 5 y 500 caracteres' })
  motivo: string;

  @IsOptional()
  @Matches(FECHA, { message: `fecha ${MENSAJE_FECHA}` })
  fecha?: string;

  /** '' o null borran la observación. */
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(500, { message: 'La observación admite hasta 500 caracteres' })
  observacion?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Una liquidación debe tener al menos un viaje',
  })
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ViajePrecioDto)
  viajes?: ViajePrecioDto[];
}
