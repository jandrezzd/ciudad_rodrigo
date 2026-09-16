import { IsString, IsOptional, IsNumber, IsInt, Min } from 'class-validator';
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

  /**
   * Cliente comprador. Se manda el id, no el nombre: el servidor rehace la copia
   * del nombre a partir del cliente, igual que en el alta.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  compradorId?: number;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  observation?: string;
}
