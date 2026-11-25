import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/** Body de POST /liquidaciones/:id/anular. */
export class AnularLiquidacionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El motivo es obligatorio' })
  @Length(5, 500, { message: 'El motivo debe tener entre 5 y 500 caracteres' })
  motivo: string;
}
