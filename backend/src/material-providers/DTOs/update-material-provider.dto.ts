import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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
