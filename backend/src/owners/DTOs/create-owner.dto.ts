import { IsString, IsOptional, Length  } from 'class-validator';

export class CreateOwnerDto {
  @IsString()
  @Length(13, 13)
  ruc: string;

  @IsString()
  companyname: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @Length(10, 10)
  document: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  canton?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}