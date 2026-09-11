import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { emptyStringToNull } from '../../common/transformers';

/**
 * Corrección desde la web. Solo lo que un administrador puede rectificar sin
 * falsear el despacho: la cantidad, el comprador y la observación. El vehículo,
 * la cantera y la hora son lo que ocurrió y no se editan.
 */
export class UpdateVentaDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  m3?: number;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  comprador?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  observation?: string;
}
