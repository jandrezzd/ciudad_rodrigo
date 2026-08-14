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

export class CreateMaterialProviderDto {
  @IsString()
  ruc: string;

  @IsString()
  razonsocial: string;

  @IsOptional()
  @IsString()
  nombreComercial?: string;

  /** INTERNO = cantera propia, EXTERNO = proveedor de terceros */
  @IsEnum(ProveedorTipo, {
    message: 'tipo debe ser INTERNO o EXTERNO',
  })
  tipo: ProveedorTipo;

  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  provincia?: string;

  @IsOptional()
  @IsString()
  canton?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatecanteraDto)
  canteras: CreatecanteraDto[];
}
