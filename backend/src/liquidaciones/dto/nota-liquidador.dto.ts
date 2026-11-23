import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

/** Body de PATCH /liquidaciones/viajes/:id/nota. '' o null borran la nota. */
export class NotaLiquidadorDto {
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value ?? null;
    const limpio = value.trim();
    return limpio === '' ? null : limpio;
  })
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'La nota debe ser texto' })
  @MaxLength(1000, { message: 'La nota admite hasta 1000 caracteres' })
  nota: string | null;
}
