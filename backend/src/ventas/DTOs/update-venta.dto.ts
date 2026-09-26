import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { emptyStringToNull } from '../../common/transformers';

/**
 * Corrección desde la web. Lo que un administrador puede rectificar sin
 * falsear el despacho: la cantidad, el comprador, el material/orden y la
 * observación. El vehículo, la cantera y la hora son lo que ocurrió y no se
 * editan.
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

  /** Nuevo material del despacho. Si se manda sin `ordenItemId`, la venta
   *  queda "libre" (sin orden). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  /** Nueva línea de orden a la que se vincula el despacho — debe ser una línea
   *  cuyo material coincida con `materialId`. `null` explícito desvincula la
   *  venta de cualquier orden (queda "libre"). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  ordenItemId?: number | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  observation?: string;
}
