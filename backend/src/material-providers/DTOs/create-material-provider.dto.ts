import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProveedorTipo } from '@prisma/client';
import { CreatecanteraDto } from './create-cantera.dto';
import { emptyStringToNull } from '../../common/transformers';

export class CreateMaterialProviderDto {
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  ruc?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  razonsocial?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  nombreComercial?: string;

  /** INTERNO = cantera propia, EXTERNO = proveedor de terceros */
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsEnum(ProveedorTipo, {
    message: 'tipo debe ser INTERNO o EXTERNO',
  })
  tipo?: ProveedorTipo;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  email?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  provincia?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  canton?: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatecanteraDto)
  canteras?: CreatecanteraDto[];
}
