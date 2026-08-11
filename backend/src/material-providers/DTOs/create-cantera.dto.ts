import { IsString, IsOptional } from 'class-validator';

export class CreatecanteraDto {
  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  provincia?: string;

  @IsOptional()
  @IsString()
  canton?: string;

  @IsOptional()
  @IsString()
  direccion?: string;
}
