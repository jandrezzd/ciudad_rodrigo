import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProveedorTipo } from '@prisma/client';
import { CreatecanteraDto } from './create-cantera.dto';

export class UpdateMaterialProviderDto {
  @IsOptional()
  @IsString()
  ruc?: string;

  @IsOptional()
  @IsString()
  razonsocial?: string;

  @IsOptional()
  @IsString()
  nombreComercial?: string;

  @IsOptional()
  @IsEnum(ProveedorTipo)
  tipo?: ProveedorTipo;

  @IsOptional()
  @IsString()
  email?: string;

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
  @Type(() => CreatecanteraDto)
  canteras?: CreatecanteraDto[];
}
