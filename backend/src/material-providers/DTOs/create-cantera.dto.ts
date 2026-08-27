import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CanteraMaterialDto } from './cantera-material.dto';
import { emptyStringToNull } from '../../common/transformers';

export class CreatecanteraDto {
  /**
   * Presente solo al actualizar: identifica una cantera ya existente para
   * conservar su id (y con él, sus planificaciones y su historial de consumo).
   */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  id?: number;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  provincia?: string;

  @IsOptional()
  @IsString()
  canton?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanteraMaterialDto)
  materiales?: CanteraMaterialDto[];
}
