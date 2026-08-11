import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatecanteraDto } from './create-cantera.dto';

export class CreateMaterialProviderDto {
  @IsString()
  ruc: string;

  @IsString()
  razonsocial: string;

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
